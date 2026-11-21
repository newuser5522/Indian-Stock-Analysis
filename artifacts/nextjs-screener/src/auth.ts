import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db, eq, isDatabaseConfigured } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { hashPassword, verifyPassword } from "@/lib/account-password";
import authConfig from "@/auth.config";

function constantTimeEqual(actual: string, expected: string): boolean {
  const actualBytes = new TextEncoder().encode(actual);
  const expectedBytes = new TextEncoder().encode(expected);
  let difference = actualBytes.length ^ expectedBytes.length;
  const length = Math.max(actualBytes.length, expectedBytes.length);
  for (let index = 0; index < length; index++) {
    difference |= (actualBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
  }
  return difference === 0;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (typeof credentials.email !== "string" || typeof credentials.password !== "string") {
          return null;
        }
        const email = credentials.email.trim().toLowerCase();
        const password = credentials.password;

        if (isDatabaseConfigured()) {
          const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
          if (user && verifyPassword(password, user.passwordHash)) {
            return { id: String(user.id), email: user.email, name: user.name };
          }
          if (user) return null;

          const adminEmail = process.env.AUTH_ADMIN_EMAIL?.trim().toLowerCase();
          const adminPassword = process.env.AUTH_ADMIN_PASSWORD;
          if (
            !adminEmail ||
            !adminPassword ||
            !constantTimeEqual(email, adminEmail) ||
            !constantTimeEqual(password, adminPassword)
          ) return null;
          try {
            const [created] = await db.insert(usersTable).values({
              email: adminEmail,
              name: "FinTrack Owner",
              passwordHash: hashPassword(adminPassword),
            }).returning();
            return { id: String(created.id), email: created.email, name: created.name };
          } catch (error) {
            console.error("Could not provision the configured owner account", error);
            return null;
          }
        }

        const adminEmail = process.env.AUTH_ADMIN_EMAIL?.trim().toLowerCase();
        const adminPassword = process.env.AUTH_ADMIN_PASSWORD;
        if (
          adminEmail &&
          adminPassword &&
          constantTimeEqual(email, adminEmail) &&
          constantTimeEqual(password, adminPassword)
        ) {
          return { id: "1", email: adminEmail, name: "FinTrack Owner" };
        }
        return null;
      },
    }),
  ],
});
