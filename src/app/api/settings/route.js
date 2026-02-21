import { NextResponse } from "next/server";
import { loadSettings, saveSettings } from "@/lib/printer";

export async function GET() {
  return NextResponse.json({ success: true, settings: loadSettings() });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const updated = { ...loadSettings(), ...body };
    saveSettings(updated);
    return NextResponse.json({ success: true, settings: updated });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
