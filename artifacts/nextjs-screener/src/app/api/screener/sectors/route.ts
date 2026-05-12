import { NextResponse } from "next/server";
import { SECTORS } from "@/lib/stock-list";

export async function GET() {
  return NextResponse.json(SECTORS);
}
