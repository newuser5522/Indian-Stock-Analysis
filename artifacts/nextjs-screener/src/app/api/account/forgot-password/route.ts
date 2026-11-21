import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, isNull } from "drizzle-orm";
import { db, eq, isDatabaseConfigured } from "@workspace/db";
import { passwordResetTokensTable, usersTable } from "@workspace/db/schema";
import { sendPasswordResetEmail } from "@/lib/email";
import { readJsonBody, RequestBodyError } from "@/lib/request-body";

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Password reset requires a configured database" }, { status: 503 });
  }
  if (!process.env.RESEND_API_KEY || !process.env.AUTH_EMAIL_FROM) {
    return NextResponse.json({ error: "Password reset email is not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    const status = error instanceof RequestBodyError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body) || !("email" in body) || typeof body.email !== "string") {
    return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
  }
  const email = body.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
  }

  try {
    const [user] = await db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (user) {
      const token = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      await db.update(passwordResetTokensTable)
        .set({ usedAt: new Date() })
        .where(and(
          eq(passwordResetTokensTable.userId, user.id),
          isNull(passwordResetTokensTable.usedAt),
        ));
      await db.insert(passwordResetTokensTable).values({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });
      const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
      const resetUrl = new URL("/reset-password", baseUrl);
      resetUrl.searchParams.set("token", token);
      await sendPasswordResetEmail(user.email, resetUrl.toString());
    }
    return NextResponse.json({ message: "If an account exists for that email, a reset link has been sent." });
  } catch (error) {
    console.error("Password reset request failed", error);
    return NextResponse.json({ error: "Password reset email could not be sent" }, { status: 502 });
  }
}
