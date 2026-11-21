import { NextResponse } from "next/server";
import { db, eq, isDatabaseConfigured } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { getCurrentUserId } from "@/lib/current-user";

export async function GET() {
  const userId = await getCurrentUserId();
  if (userId == null) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ user: { id: String(userId), name: "FinTrack Owner" } });
  }
  try {
    const [user] = await db.select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json({ user: { id: String(user.id), name: user.name } });
  } catch (error) {
    console.error("Could not load account identity", error);
    return NextResponse.json({ error: "Could not load account" }, { status: 500 });
  }
}
