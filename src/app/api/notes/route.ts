import { NextResponse } from "next/server";
import { getNotes } from "@/lib/db";

export function GET() {
  return NextResponse.json({ notes: getNotes() });
}
