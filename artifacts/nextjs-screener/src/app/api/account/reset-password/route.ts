import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, isDatabaseConfigured } from "@workspace/db";
import { passwordResetTokensTable, usersTable } from "@workspace/db/schema";
import { hashPassword, validatePassword } from "@/lib/account-password";
import { readJsonBody, RequestBodyError } from "@/lib/request-body";

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Password reset requires a configured database" }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    const status = error instanceof RequestBodyError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
  }
  const { token, password } = body as Record<string, unknown>;
  if (typeof token !== "string" || token.length < 32 || token.length > 128) {
    return NextResponse.json({ error: "Reset link is invalid or expired" }, { status: 400 });
  }
  if (!validatePassword(password)) {
    return NextResponse.json({ error: "Password must be 12 to 256 characters" }, { status: 400 });
  }

  try {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const changed = await db.transaction(async (tx) => {
      const [reset] = await tx.select({ id: passwordResetTokensTable.id, userId: passwordResetTokensTable.userId })
        .from(passwordResetTokensTable)
        .where(and(
          eq(passwordResetTokensTable.tokenHash, tokenHash),
          isNull(passwordResetTokensTable.usedAt),
          gt(passwordResetTokensTable.expiresAt, new Date()),
        ))
        .for("update")
        .limit(1);
      if (!reset) return false;
      await tx.update(usersTable)
        .set({ passwordHash: hashPassword(password) })
        .where(eq(usersTable.id, reset.userId));
      await tx.update(passwordResetTokensTable)
        .set({ usedAt: new Date() })
        .where(and(
          eq(passwordResetTokensTable.userId, reset.userId),
          isNull(passwordResetTokensTable.usedAt),
        ));
      return true;
    });
    if (!changed) return NextResponse.json({ error: "Reset link is invalid or expired" }, { status: 400 });
    return NextResponse.json({ message: "Password has been reset. You can now sign in." });
  } catch (error) {
    console.error("Password reset failed", error);
    return NextResponse.json({ error: "Could not reset password" }, { status: 500 });
  }
}
