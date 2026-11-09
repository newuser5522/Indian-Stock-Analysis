import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

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
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const adminEmail = process.env.AUTH_ADMIN_EMAIL?.trim().toLowerCase();
        const adminPassword = process.env.AUTH_ADMIN_PASSWORD;
        if (
          !adminEmail ||
          !adminPassword ||
          typeof credentials.email !== "string" ||
          typeof credentials.password !== "string"
        ) {
          return null;
        }

        if (
          !constantTimeEqual(credentials.email.trim().toLowerCase(), adminEmail) ||
          !constantTimeEqual(credentials.password, adminPassword)
        ) {
          return null;
        }

        return { id: adminEmail, email: adminEmail, name: "FinTrack Owner" };
      },
    }),
  ],
});
