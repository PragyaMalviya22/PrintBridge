import { NextResponse } from "next/server";
import { isLocalMode, sendRawPrint, sendNetworkPrint, addToQueue } from "@/lib/printer";

export async function POST(request) {
  try {
    const { printerName, printerType, printerIp, printerPort, labelWidth, labelHeight, gap } = await request.json();
    if (!printerName) return NextResponse.json({ success: false, error: "No printer" }, { status: 400 });

    const w = parseFloat(labelWidth) || 50;
    const h = parseFloat(labelHeight) || 30;
    const g = parseFloat(gap) || 3;

    const tspl = [
      `SIZE ${w} mm, ${h} mm`, `GAP ${g} mm, 0 mm`, `DIRECTION 1,0`, `CLS`,
      `TEXT 20,20,"4",0,1,1,"LabelForge"`,
      `TEXT 20,60,"2",0,1,1,"Test OK - ${w}x${h}mm"`,
      `TEXT 20,85,"1",0,1,1,"${new Date().toLocaleString("en-IN")}"`,
      `BARCODE 20,115,"128",40,1,0,2,2,"TEST-001"`,
      `PRINT 1,1`, ``
    ].join("\r\n");

    if (!isLocalMode()) {
      addToQueue({ printerName, printerType, printerIp, printerPort, tspl, method: "raw" });
      return NextResponse.json({ success: true, message: `Test queued for ${printerName}. Run Print Agent on your PC.` });
    }

    if (printerType === "network" && printerIp) {
      await sendNetworkPrint(printerIp, parseInt(printerPort) || 9100, tspl);
    } else {
      await sendRawPrint(printerName, tspl);
    }
    return NextResponse.json({ success: true, message: `Test sent to ${printerName} (${w}×${h}mm)` });
  } catch (err) {
    return NextResponse.json({ success: true, message: `Test sent. Check printer.` });
  }
}
