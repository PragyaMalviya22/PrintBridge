import { NextResponse } from "next/server";
import {
  isLocalMode, loadSettings, generateTSPL,
  sendRawPrint, sendNetworkPrint, sendGDIPrint, addToQueue,
} from "@/lib/printer";

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      printerName, printerType, printerIp, printerPort,
      text, sku, serial, price,
      labelWidth, labelHeight, gap,
      showBarcode, showQR, showDate, showSerial, showPrice,
      copies, method, fontSize,
    } = body;

    if (!text?.trim())
      return NextResponse.json({ success: false, error: "Product name required" }, { status: 400 });

    const date = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const w = parseFloat(labelWidth) || 50;
    const h = parseFloat(labelHeight) || 30;
    const g = parseFloat(gap) || 3;
    const qty = parseInt(copies) || 1;

    const tsplJob = {
      text: text.trim(), sku: sku || "", serial: serial || "", price: price || "", date,
      labelWidth: w, labelHeight: h, gap: g,
      showBarcode: showBarcode === true, showQR: showQR === true,
      showDate: showDate === true, showSerial: showSerial === true,
      showPrice: showPrice === true, copies: qty,
      fontSize: parseInt(fontSize) || 3,
    };

    const tspl = generateTSPL(tsplJob);
    const msg = `${qty}x "${text.trim()}" [${w}×${h}mm]`;

    // ══════════════════════════════════════════
    // CLOUD MODE — add to print queue
    // ══════════════════════════════════════════
    if (!isLocalMode()) {
      const job = addToQueue({
        printerName: printerName || "default",
        printerType, printerIp, printerPort,
        tspl,
        label: tsplJob,
        method: method || "raw",
      });
      return NextResponse.json({
        success: true,
        message: `Queued: ${msg}`,
        method: "QUEUE",
        jobId: job.id,
      });
    }

    // ══════════════════════════════════════════
    // LOCAL MODE — print directly
    // ══════════════════════════════════════════
    if (!printerName)
      return NextResponse.json({ success: false, error: "No printer selected" }, { status: 400 });

    // WiFi printer
    if (printerType === "network" && printerIp) {
      await sendNetworkPrint(printerIp, parseInt(printerPort) || 9100, tspl);
      return NextResponse.json({ success: true, message: `Printed: ${msg}`, method: "NETWORK" });
    }

    const pm = method || loadSettings().printMethod || "raw";

    // USB RAW
    if (pm === "raw") {
      await sendRawPrint(printerName, tspl);
      return NextResponse.json({ success: true, message: `Printed: ${msg}`, method: "RAW" });
    }

    // GDI
    let content = text.trim();
    if (showSerial && serial) content += `\n${serial}`;
    if (showDate) content += `\n${date}`;
    if (showPrice && price) content += `\nRs.${price}`;
    if (showBarcode && sku) content += `\n${sku}`;
    await sendGDIPrint(printerName, content);
    return NextResponse.json({ success: true, message: `Printed: ${msg}`, method: "GDI" });

  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
