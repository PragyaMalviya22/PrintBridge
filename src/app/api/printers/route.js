import { NextResponse } from "next/server";
import { listPrinters, isLocalMode } from "@/lib/printer";

export async function GET() {
  return NextResponse.json({
    success: true,
    mode: isLocalMode() ? "local" : "cloud",
    printers: listPrinters(),
  });
}
