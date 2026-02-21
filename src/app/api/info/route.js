import { NextResponse } from "next/server";
import { loadSettings, getNetworkAddresses, isLocalMode } from "@/lib/printer";
import os from "os";

export async function GET() {
  const local = isLocalMode();
  const addresses = getNetworkAddresses();
  return NextResponse.json({
    status: "running",
    mode: local ? "local" : "cloud",
    hostname: os.hostname(),
    addresses,
    mobileUrl: local && addresses[0] ? `http://${addresses[0]}:3000` : null,
    settings: loadSettings(),
  });
}
