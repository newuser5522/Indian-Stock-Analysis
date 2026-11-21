import { NextRequest, NextResponse } from "next/server";
import { db, eq, isDatabaseConfigured } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { hashPassword, validatePassword } from "@/lib/account-password";
import { readJsonBody, RequestBodyError } from "@/lib/request-body";

async function provisionConfiguredOwner() {
  const email = process.env.AUTH_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.AUTH_ADMIN_PASSWORD;
  if (!email || !password) return;
  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!existing) {
    try {
      await db.insert(usersTable).values({
        email,
        name: "FinTrack Owner",
        passwordHash: hashPassword(password),
      });
    } catch (error) {
      const [afterRace] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
      if (!afterRace) throw error;
    }
  }
}

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Account registration requires a configured database" }, { status: 503 });
  }
  if (!process.env.AUTH_ADMIN_EMAIL?.trim() || !process.env.AUTH_ADMIN_PASSWORD) {
    return NextResponse.json(
      { error: "Account registration is not configured. Set AUTH_ADMIN_EMAIL and AUTH_ADMIN_PASSWORD first." },
      { status: 503 },
    );
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
  const { email, password, name } = body as Record<string, unknown>;
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (!validatePassword(password)) {
    return NextResponse.json({ error: "Password must be 12 to 256 characters" }, { status: 400 });
  }
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
    return NextResponse.json({ error: "Name must be between 1 and 100 characters" }, { status: 400 });
  }

  try {
    await provisionConfiguredOwner();
    const normalizedEmail = email.trim().toLowerCase();
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1);
    if (existing) return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    const [created] = await db.insert(usersTable).values({
      email: normalizedEmail,
      name: name.trim(),
      passwordHash: hashPassword(password),
    }).returning({ id: usersTable.id, email: usersTable.email, name: usersTable.name });
    return NextResponse.json({ user: created }, { status: 201 });
  } catch (error) {
    console.error("Account registration failed", error);
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not create account" }, { status: 500 });
  }
}
