/**
 * ═══════════════════════════════════════════════════════════
 * Printium Print Agent
 * ═══════════════════════════════════════════════════════════
 * 
 * This runs on your Windows PC that has the printer connected via USB.
 * It polls the cloud Printium server every 3 seconds for new print jobs,
 * then sends them to your local printer.
 * 
 * SETUP:
 *   1. Edit CLOUD_URL below to your Vercel URL
 *   2. Edit PRINTER_NAME to your printer name (from Windows)
 *   3. npm install
 *   4. npm start
 * 
 * That's it! Leave it running. When anyone prints from their phone,
 * this agent picks up the job and prints it.
 * ═══════════════════════════════════════════════════════════
 */

const axios = require("axios");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const net = require("net");
const https = require("https");

// Bypass local SSL/network block issues in Windows
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  timeout: 10000
});

// ════════════════════════════════════════════════════
// ⚙️ CONFIGURATION — EDIT THESE
// ════════════════════════════════════════════════════
const CLOUD_URL = (process.env.CLOUD_URL || "http://localhost:3000").trim().replace(/[\r\n]/g, "");
const PRINTER_NAME = process.env.PRINTER_NAME || ""; // Leave empty to auto-detect first printer
const POLL_INTERVAL = 3000; // Check every 3 seconds

// ════════════════════════════════════════════════════
// RAW PRINT via PowerShell
// ════════════════════════════════════════════════════
function rawPrintPS(printerName, filePath) {
  return `
$printer = "${printerName.replace(/"/g, '`"')}"
$file    = "${filePath.replace(/\\/g, "\\\\")}"
try {
  Add-Type -TypeDefinition @"
using System; using System.IO; using System.Runtime.InteropServices;
public class RawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.Drv",EntryPoint="OpenPrinterA",SetLastError=true,CharSet=CharSet.Ansi,ExactSpelling=true,CallingConvention=CallingConvention.StdCall)]
  public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string sz, out IntPtr h, IntPtr pd);
  [DllImport("winspool.Drv",EntryPoint="ClosePrinter",SetLastError=true,ExactSpelling=true,CallingConvention=CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.Drv",EntryPoint="StartDocPrinterA",SetLastError=true,CharSet=CharSet.Ansi,ExactSpelling=true,CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr h, Int32 l, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.Drv",EntryPoint="EndDocPrinter",SetLastError=true,ExactSpelling=true,CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.Drv",EntryPoint="StartPagePrinter",SetLastError=true,ExactSpelling=true,CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.Drv",EntryPoint="EndPagePrinter",SetLastError=true,ExactSpelling=true,CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.Drv",EntryPoint="WritePrinter",SetLastError=true,ExactSpelling=true,CallingConvention=CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr h, IntPtr p, Int32 c, out Int32 w);
  public static bool Send(string name, byte[] data) {
    IntPtr h; var di = new DOCINFOA(); di.pDocName="Printium Agent"; di.pDataType="RAW";
    if(!OpenPrinter(name.Normalize(),out h,IntPtr.Zero)) return false;
    if(!StartDocPrinter(h,1,di)){ClosePrinter(h);return false;}
    if(!StartPagePrinter(h)){EndDocPrinter(h);ClosePrinter(h);return false;}
    IntPtr ptr=Marshal.AllocCoTaskMem(data.Length); Marshal.Copy(data,0,ptr,data.Length);
    int w; bool ok=WritePrinter(h,ptr,data.Length,out w); Marshal.FreeCoTaskMem(ptr);
    EndPagePrinter(h); EndDocPrinter(h); ClosePrinter(h); return ok;
  }
}
"@
  $b=[System.IO.File]::ReadAllBytes($file)
  if([RawPrint]::Send($printer,$b)){Write-Output "SUCCESS"}else{Write-Output "FAILED"}
} catch { Write-Output "ERROR: $_" }`;
}

function sendRawPrint(printerName, content) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `lfa_${Date.now()}.prn`);
    const ps = path.join(os.tmpdir(), `lfa_${Date.now()}.ps1`);
    fs.writeFileSync(tmp, content);
    fs.writeFileSync(ps, rawPrintPS(printerName, tmp));
    exec(`powershell -ExecutionPolicy Bypass -File "${ps}"`, { timeout: 15000 }, (err, stdout) => {
      try { fs.unlinkSync(tmp); fs.unlinkSync(ps); } catch (_) {}
      if (err) return reject(err);
      if (stdout.trim().includes("SUCCESS")) resolve();
      else reject(new Error(stdout.trim() || "Failed"));
    });
  });
}

function sendNetworkPrint(ip, port, content) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(10000);
    socket.connect(port || 9100, ip, () => {
      socket.write(content, () => { socket.end(); resolve(); });
    });
    socket.on("error", (e) => { socket.destroy(); reject(e); });
    socket.on("timeout", () => { socket.destroy(); reject(new Error("Timeout")); });
  });
}

// ════════════════════════════════════════════════════
// AUTO-DETECT PRINTER
// ════════════════════════════════════════════════════
function detectPrinter() {
  if (PRINTER_NAME) return PRINTER_NAME;
  try {
    const { execSync } = require("child_process");
    const raw = execSync('powershell -Command "Get-Printer | Select-Object Name,PrinterStatus | ConvertTo-Json"', { encoding: "utf-8", timeout: 5000 });
    let list = JSON.parse(raw);
    if (!Array.isArray(list)) list = [list];
    const ready = list.find((p) => p.PrinterStatus === 0);
    if (ready) return ready.Name;
    if (list.length > 0) return list[0].Name;
  } catch (_) {}
  return "";
}

// ════════════════════════════════════════════════════
// MAIN LOOP
// ════════════════════════════════════════════════════
async function pollAndPrint() {
  try {
    const { data } = await axiosInstance.get(`${CLOUD_URL}/api/print-queue`);
    if (!data.jobs || data.jobs.length === 0) return;

    const defaultPrinter = detectPrinter();

    for (const job of data.jobs) {
      try {
        const pName = job.printerName === "default" ? defaultPrinter : (job.printerName || defaultPrinter);
        if (!pName) {
          console.log(`⚠️  No printer found for job ${job.id}`);
          await axiosInstance.post(`${CLOUD_URL}/api/print-queue`, { jobId: job.id, status: "failed" });
          continue;
        }

        console.log(`🖨️  Printing job ${job.id} → ${pName}`);

        if (job.printerType === "network" && job.printerIp) {
          await sendNetworkPrint(job.printerIp, job.printerPort || 9100, job.tspl);
        } else {
          await sendRawPrint(pName, job.tspl);
        }

        await axiosInstance.post(`${CLOUD_URL}/api/print-queue`, { jobId: job.id, status: "done" });
        console.log(`✅  Done: ${job.id}`);
      } catch (err) {
        console.error(`❌  Failed: ${job.id} — ${err.message}`);
        try {
          await axiosInstance.post(`${CLOUD_URL}/api/print-queue`, { jobId: job.id, status: "failed" });
        } catch (_) {}
      }
    }
  } catch (err) {
    // Server unreachable — silent retry
    if (err.code !== "ECONNREFUSED") {
      const msg = err.response ? err.response.statusText : err.message;
      console.error(`⚠️  Poll error: ${msg} (Code: ${err.code || 'UNKNOWN'})`);
    }
  }
}

// ════════════════════════════════════════════════════
// START
// ════════════════════════════════════════════════════
const detectedPrinter = detectPrinter();

console.log("");
console.log("  ╔══════════════════════════════════════════════╗");
console.log("  ║       🏷️  Printium Print Agent              ║");
console.log("  ╠══════════════════════════════════════════════╣");
console.log(`  ║  Server:  ${CLOUD_URL.padEnd(34)}║`);
console.log(`  ║  Printer: ${(detectedPrinter || "⚠️ Not found").padEnd(34)}║`);
console.log(`  ║  Poll:    Every ${POLL_INTERVAL / 1000}s${"".padEnd(28)}║`);
console.log("  ║                                              ║");
console.log("  ║  Waiting for print jobs...                   ║");
console.log("  ╚══════════════════════════════════════════════╝");
console.log("");

if (!detectedPrinter) {
  console.log("  ⚠️  No printer detected! Please set PRINTER_NAME:");
  console.log('  set PRINTER_NAME="TSC TP-244 Pro" && npm start');
  console.log("");
}

setInterval(pollAndPrint, POLL_INTERVAL);
pollAndPrint();
