import fs from "fs";
import path from "path";
import os from "os";

// ════════════════════════════════════════════════════════════
// DETECT MODE: Local (has PowerShell) vs Cloud (Vercel etc.)
// ════════════════════════════════════════════════════════════
export function isLocalMode() {
  // If running on Vercel or cloud, no PowerShell / no printers
  if (process.env.VERCEL || process.env.RAILWAY || process.env.RENDER) return false;
  // Check if Windows (PowerShell available)
  return process.platform === "win32";
}

// ════════════════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════════════════
const SETTINGS_FILE = path.join(process.cwd(), "settings.json");

export function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE))
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
  } catch (_) {}
  return {
    defaultPrinter: "",
    labelWidth: 50,
    labelHeight: 30,
    printMethod: "raw",
    networkPrinters: [],
  };
}

export function saveSettings(data) {
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2)); } catch (_) {}
}

// ════════════════════════════════════════════════════════════
// PRINT QUEUE (for Cloud mode — Agent picks up jobs)
// ════════════════════════════════════════════════════════════
const QUEUE_FILE = path.join(process.cwd(), "print-queue.json");

export function loadQueue() {
  try {
    if (fs.existsSync(QUEUE_FILE))
      return JSON.parse(fs.readFileSync(QUEUE_FILE, "utf-8"));
  } catch (_) {}
  return [];
}

export function saveQueue(queue) {
  try { fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2)); } catch (_) {}
}

export function addToQueue(job) {
  const queue = loadQueue();
  const entry = {
    id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ...job,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  queue.push(entry);
  saveQueue(queue);
  return entry;
}

export function getPendingJobs() {
  return loadQueue().filter((j) => j.status === "pending");
}

export function markJobDone(jobId, status = "done") {
  const queue = loadQueue();
  const job = queue.find((j) => j.id === jobId);
  if (job) {
    job.status = status;
    job.completedAt = new Date().toISOString();
  }
  // Keep only last 200 jobs
  saveQueue(queue.slice(-200));
  return job;
}

// ════════════════════════════════════════════════════════════
// NETWORK HELPERS
// ════════════════════════════════════════════════════════════
export function getNetworkAddresses() {
  const addrs = [];
  try {
    const ifaces = os.networkInterfaces();
    for (const n of Object.keys(ifaces))
      for (const i of ifaces[n])
        if (i.family === "IPv4" && !i.internal) addrs.push(i.address);
  } catch (_) {}
  return addrs;
}

// ════════════════════════════════════════════════════════════
// LIST PRINTERS (Local mode only)
// ════════════════════════════════════════════════════════════
export function listPrinters() {
  const printers = [];

  if (isLocalMode()) {
    try {
      const { execSync } = require("child_process");
      const ps = `powershell -Command "Get-Printer | Select-Object Name,DriverName,PortName,PrinterStatus,Shared | ConvertTo-Json"`;
      const raw = execSync(ps, { encoding: "utf-8", timeout: 10000 });
      let parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) parsed = [parsed];
      for (const p of parsed) {
        printers.push({
          name: p.Name, driver: p.DriverName || "", port: p.PortName || "",
          status: p.PrinterStatus === 0 ? "Ready" : "Offline", type: "usb",
        });
      }
    } catch (_) {}
  }

  // Saved network/WiFi printers
  const settings = loadSettings();
  if (settings.networkPrinters) {
    for (const np of settings.networkPrinters) {
      printers.push({
        name: np.name || `WiFi: ${np.ip}:${np.port || 9100}`,
        ip: np.ip, netPort: np.port || 9100,
        type: "network", status: "Network",
      });
    }
  }

  return printers;
}

// ════════════════════════════════════════════════════════════
// TSPL COMMAND GENERATOR — any custom mm size
// ════════════════════════════════════════════════════════════
export function generateTSPL(job) {
  const c = (s) => String(s).replace(/"/g, "'").replace(/\\/g, "");
  const {
    text = "", sku = "", serial = "", price = "", date = "",
    labelWidth = 50, labelHeight = 30,
    showBarcode = false, showQR = false, showDate = false,
    showSerial = false, showPrice = false, copies = 1,
    fontSize = 3, gap = 3,
  } = job;

  const dpmm = 8;
  const wDots = labelWidth * dpmm;
  const hDots = labelHeight * dpmm;
  const margin = 16;
  const lines = [
    `SIZE ${labelWidth} mm, ${labelHeight} mm`,
    `GAP ${gap} mm, 0 mm`,
    `DIRECTION 1,0`,
    `REFERENCE 0,0`,
    `CLS`,
  ];

  let y = 16;
  const fontNum = Math.max(1, Math.min(5, fontSize));
  lines.push(`TEXT ${margin},${y},"${fontNum}",0,1,1,"${c(text)}"`);
  y += [16, 24, 32, 40, 48][fontNum - 1] + 8;

  if (showSerial && serial) { lines.push(`TEXT ${margin},${y},"2",0,1,1,"${c(serial)}"`); y += 28; }
  if (showDate && date) { lines.push(`TEXT ${margin},${y},"1",0,1,1,"${c(date)}"`); y += 22; }
  if (showPrice && price) { lines.push(`TEXT ${margin},${y},"3",0,1,1,"Rs.${c(price)}"`); y += 36; }
  if (showBarcode && sku) {
    const bh = Math.min(60, Math.max(30, hDots - y - 20));
    lines.push(`BARCODE ${margin},${y},"128",${bh},1,0,2,2,"${c(sku)}"`);
    y += bh + 20;
  }
  if (showQR) {
    const qs = Math.max(3, Math.min(6, Math.floor(labelWidth / 20)));
    const qx = wDots - (qs * 25 + margin);
    lines.push(`QRCODE ${Math.max(margin, qx)},16,L,${qs},A,0,"${c(text)}|${c(sku)}|${c(serial)}"`);
  }

  lines.push(`PRINT ${copies},1`, ``);
  return lines.join("\r\n");
}

// ════════════════════════════════════════════════════════════
// RAW PRINT — USB via PowerShell (Local mode)
// ════════════════════════════════════════════════════════════
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
    IntPtr h; var di = new DOCINFOA(); di.pDocName="LabelForge"; di.pDataType="RAW";
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

export function sendRawPrint(printerName, content) {
  return new Promise((resolve, reject) => {
    const { exec } = require("child_process");
    const tmp = path.join(os.tmpdir(), `lf_${Date.now()}.prn`);
    const ps = path.join(os.tmpdir(), `lf_${Date.now()}.ps1`);
    fs.writeFileSync(tmp, content);
    fs.writeFileSync(ps, rawPrintPS(printerName, tmp));
    exec(`powershell -ExecutionPolicy Bypass -File "${ps}"`, { timeout: 15000 }, (err, stdout) => {
      try { fs.unlinkSync(tmp); fs.unlinkSync(ps); } catch (_) {}
      if (err) return reject(new Error(err.message));
      if (stdout.trim().includes("SUCCESS")) resolve("SUCCESS");
      else reject(new Error(stdout.trim() || "Print failed"));
    });
  });
}

// ════════════════════════════════════════════════════════════
// NETWORK PRINT — WiFi via TCP socket (port 9100)
// ════════════════════════════════════════════════════════════
export function sendNetworkPrint(ip, port, content) {
  const net = require("net");
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(10000);
    socket.connect(port || 9100, ip, () => {
      socket.write(content, () => { socket.end(); resolve("SUCCESS"); });
    });
    socket.on("error", (e) => { socket.destroy(); reject(new Error(`WiFi print failed: ${e.message}`)); });
    socket.on("timeout", () => { socket.destroy(); reject(new Error(`WiFi timeout: ${ip}:${port}`)); });
  });
}

// ════════════════════════════════════════════════════════════
// GDI PRINT — Windows fallback (any printer)
// ════════════════════════════════════════════════════════════
export function sendGDIPrint(printerName, content) {
  return new Promise((resolve, reject) => {
    const { exec } = require("child_process");
    const tmp = path.join(os.tmpdir(), `lf_gdi_${Date.now()}.txt`);
    fs.writeFileSync(tmp, content);
    exec(`powershell -Command "Get-Content '${tmp.replace(/'/g, "''")}' | Out-Printer '${printerName.replace(/'/g, "''")}'"`
    , { timeout: 15000 }, (err) => {
      try { fs.unlinkSync(tmp); } catch (_) {}
      if (err) return reject(new Error(err.message));
      resolve("SUCCESS");
    });
  });
}
