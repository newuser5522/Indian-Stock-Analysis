import { NextRequest, NextResponse } from "next/server";
import { db, eq, isDatabaseConfigured, sql } from "@workspace/db";
import { portfolioGroupTable } from "@workspace/db/schema";
import { readJsonBody, RequestBodyError } from "@/lib/request-body";
import { getCurrentUserId } from "@/lib/current-user";

async function ensureDefaultPortfolio(ownerId: number) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(73641203)`);
    const [existing] = await tx
      .select({ id: portfolioGroupTable.id })
      .from(portfolioGroupTable)
      .where(eq(portfolioGroupTable.ownerId, ownerId))
      .limit(1);
    if (!existing) {
      await tx.insert(portfolioGroupTable).values({ ownerId, name: "My Portfolio" });
    }
  });
}

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  const ownerId = await getCurrentUserId();
  if (ownerId == null) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    await ensureDefaultPortfolio(ownerId);
    const portfolios = await db.select().from(portfolioGroupTable)
      .where(eq(portfolioGroupTable.ownerId, ownerId))
      .orderBy(portfolioGroupTable.id);
    return NextResponse.json(portfolios);
  } catch (error) {
    console.error("Portfolio list failed", error);
    return NextResponse.json({ error: "Failed to fetch portfolios" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  const ownerId = await getCurrentUserId();
  if (ownerId == null) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    await ensureDefaultPortfolio(ownerId);
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      const status = error instanceof RequestBodyError ? error.status : 400;
      const message = error instanceof Error ? error.message : "Request body is invalid";
      return NextResponse.json({ error: message }, { status });
    }
    if (typeof body !== "object" || body === null || !("name" in body) || typeof body.name !== "string") {
      return NextResponse.json({ error: "Portfolio name is required" }, { status: 400 });
    }
    const name = body.name.trim();
    if (!name || name.length > 60) {
      return NextResponse.json({ error: "Portfolio name must be between 1 and 60 characters" }, { status: 400 });
    }
    const [portfolio] = await db
      .insert(portfolioGroupTable)
      .values({ ownerId, name })
      .returning();
    return NextResponse.json(portfolio, { status: 201 });
  } catch (error) {
    console.error("Portfolio creation failed", error);
    return NextResponse.json({ error: "Failed to create portfolio" }, { status: 500 });
  }
}
