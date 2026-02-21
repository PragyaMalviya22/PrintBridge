import { NextResponse } from "next/server";
import { loadSettings, saveSettings } from "@/lib/printer";

export async function POST(request) {
  try {
    const { name, ip, port } = await request.json();
    if (!ip) return NextResponse.json({ success: false, error: "IP required" }, { status: 400 });
    const settings = loadSettings();
    if (!settings.networkPrinters) settings.networkPrinters = [];
    if (settings.networkPrinters.find((p) => p.ip === ip && p.port === (port || 9100)))
      return NextResponse.json({ success: false, error: "Already exists" }, { status: 400 });
    settings.networkPrinters.push({ name: name || `WiFi: ${ip}`, ip, port: parseInt(port) || 9100 });
    saveSettings(settings);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { ip, port } = await request.json();
    const settings = loadSettings();
    settings.networkPrinters = (settings.networkPrinters || []).filter(
      (p) => !(p.ip === ip && p.port === (port || 9100))
    );
    saveSettings(settings);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
