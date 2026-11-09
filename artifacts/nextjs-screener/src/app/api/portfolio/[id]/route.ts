import { NextRequest, NextResponse } from "next/server";
import { db, eq, isDatabaseConfigured } from "@workspace/db";
import { portfolioTable } from "@workspace/db/schema";
import {
  parsePortfolioId,
  validatePortfolioUpdate,
} from "@/lib/portfolio-validation";
import { readJsonBody, RequestBodyError } from "@/lib/request-body";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { id } = await params;
    const numId = parsePortfolioId(id);
    if (numId == null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const [deleted] = await db
      .delete(portfolioTable)
      .where(eq(portfolioTable.id, numId))
      .returning({ id: portfolioTable.id });
    if (!deleted) return NextResponse.json({ error: "Holding not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Portfolio holding delete failed", error);
    return NextResponse.json({ error: "Failed to remove holding" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { id } = await params;
    const numId = parsePortfolioId(id);
    if (numId == null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      const status = error instanceof RequestBodyError ? error.status : 400;
      const message = error instanceof Error ? error.message : "Request body is invalid";
      return NextResponse.json({ error: message }, { status });
    }
    const validation = validatePortfolioUpdate(body);
    if ("error" in validation) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const [updated] = await db
      .update(portfolioTable)
      .set(validation.value)
      .where(eq(portfolioTable.id, numId))
      .returning();
    if (!updated) return NextResponse.json({ error: "Holding not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Portfolio holding update failed", error);
    return NextResponse.json({ error: "Failed to update holding" }, { status: 500 });
  }
}
