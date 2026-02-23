"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { QRCodeCanvas } from "qrcode.react";
import Barcode from "@/components/Barcode";
import Toast from "@/components/Toast";
import {
  getServerInfo, getPrinters, printLabel, testPrint,
  getSettings, saveSettings, addNetPrinter, removeNetPrinter,
} from "@/lib/clientApi";

const PRESETS = [
  { w:25,h:15,n:"Tiny" },{ w:38,h:25,n:"Small" },{ w:50,h:25,n:"Med" },{ w:50,h:30,n:"Std" },
  { w:75,h:50,n:"Large" },{ w:100,h:50,n:"XL" },{ w:100,h:75,n:"XXL" },{ w:100,h:100,n:"Sq" },
];

export default function Home() {
  const [info, setInfo] = useState(null);
  const [mode, setMode] = useState("local"); // local | cloud
  const [printers, setPrinters] = useState([]);
  const [printer, setPrinter] = useState("");
  const [connected, setConnected] = useState(false);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [serial, setSerial] = useState("SN-0001");
  const [price, setPrice] = useState("");
  const [copies, setCopies] = useState(1);

  const [barcode, setBarcode] = useState(false);
  const [qr, setQr] = useState(false);
  const [dateOn, setDateOn] = useState(false);
  const [serialOn, setSerialOn] = useState(false);
  const [priceOn, setPriceOn] = useState(false);

  const [lw, setLw] = useState(50);
  const [lh, setLh] = useState(30);
  const [gap, setGap] = useState(3);
  const [fontSize, setFontSize] = useState(3);
  const [showCustom, setShowCustom] = useState(false);
  const [method, setMethod] = useState("raw");

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wifiOpen, setWifiOpen] = useState(false);
  const [wifiName, setWifiName] = useState("");
  const [wifiIp, setWifiIp] = useState("");
  const [wifiPort, setWifiPort] = useState("9100");

  const [previewOpen, setPreviewOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [toast, setToast] = useState({ show: false, msg: "", err: false });
  const [busy, setBusy] = useState(false);
  const inputRef = useRef();

  const cp = printers.find((p) => p.name === printer) || {};

  // Init
  useEffect(() => {
    (async () => {
      try {
        const i = await getServerInfo();
        setInfo(i); setMode(i.mode || "local"); setConnected(true);
        const pd = await getPrinters();
        if (pd.printers) { setPrinters(pd.printers); setPrinter(i.settings?.defaultPrinter || pd.printers[0]?.name || ""); }
        const s = await getSettings();
        if (s?.printMethod) setMethod(s.printMethod);
        if (s?.labelWidth) setLw(s.labelWidth);
        if (s?.labelHeight) setLh(s.labelHeight);
      } catch { setConnected(false); }
    })();
    try { const h = localStorage.getItem("lf3"); if (h) setHistory(JSON.parse(h)); } catch {}
  }, []);

  // Ctrl+P
  useEffect(() => {
    const fn = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "p") { e.preventDefault(); doPrint(); } };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  });

  const notify = useCallback((m, e = false) => {
    setToast({ show: true, msg: m, err: e });
    setTimeout(() => setToast((t) => ({ ...t, show: false })), 3500);
  }, []);

  const incSerial = (s, n = 1) => {
    const m = s.match(/^(.*?)(\d+)$/);
    return m ? m[1] + String(parseInt(m[2]) + n).padStart(m[2].length, "0") : s;
  };

  async function doPrint() {
    if (!name.trim()) { notify("Enter product name", true); inputRef.current?.focus(); return; }
    if (mode === "local" && !printer) { notify("Select a printer", true); return; }
    setBusy(true);
    try {
      const r = await printLabel({
        printerName: printer || "default",
        printerType: cp.type || "usb", printerIp: cp.ip || "", printerPort: cp.netPort || 9100,
        text: name.trim(), sku: barcode ? (sku || "0000") : "", serial: serialOn ? serial : "", price: priceOn ? price : "",
        labelWidth: lw, labelHeight: lh, gap,
        showBarcode: barcode, showQR: qr, showDate: dateOn, showSerial: serialOn, showPrice: priceOn,
        copies, method, fontSize,
      });
      notify(`✅ ${r.message}`);
      const entry = { name, sku, serial, copies, lw, lh, time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) };
      const nh = [entry, ...history].slice(0, 50);
      setHistory(nh);
      try { localStorage.setItem("lf3", JSON.stringify(nh)); } catch {}
      if (serialOn) setSerial(incSerial(serial, copies));
    } catch (e) { notify(e.response?.data?.error || "Print failed", true); }
    setBusy(false);
  }

  async function doTest() {
    if (mode === "local" && !printer) return notify("Select printer", true);
    try { const r = await testPrint({ printerName: printer || "default", printerType: cp.type, printerIp: cp.ip, printerPort: cp.netPort, labelWidth: lw, labelHeight: lh, gap }); notify(r.message); }
    catch { notify("Test failed", true); }
  }

  async function doRefresh() {
    try { const d = await getPrinters(); setPrinters(d.printers || []); notify(`Found ${d.printers?.length || 0} printers`); }
    catch { notify("Could not fetch", true); }
  }

  async function doSave() {
    try { await saveSettings({ defaultPrinter: printer, labelWidth: lw, labelHeight: lh, printMethod: method }); notify("Saved!"); setSettingsOpen(false); }
    catch { notify("Failed", true); }
  }

  async function doAddWifi() {
    if (!wifiIp.trim()) return notify("Enter IP", true);
    try { await addNetPrinter({ name: wifiName || `WiFi: ${wifiIp}`, ip: wifiIp.trim(), port: parseInt(wifiPort) || 9100 }); notify(`Added ${wifiIp}`); setWifiName(""); setWifiIp(""); setWifiPort("9100"); setWifiOpen(false); doRefresh(); }
    catch (e) { notify(e.response?.data?.error || "Failed", true); }
  }

  async function doRemoveWifi(p) {
    try { await removeNetPrinter({ ip: p.ip, port: p.netPort }); notify("Removed"); doRefresh(); } catch { notify("Failed", true); }
  }

  const reprint = (h) => { setName(h.name); setSku(h.sku || ""); setSerial(h.serial || "SN-0001"); setCopies(h.copies || 1); if (h.lw) { setLw(h.lw); setLh(h.lh); } };
  const clear = () => { setName(""); setSku(""); setSerial("SN-0001"); setPrice(""); setCopies(1); inputRef.current?.focus(); };
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  // Styles
  const S = {
    card: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 16px", marginBottom: 14, animation: "fadeIn .4s ease" },
    lbl: { fontSize: 11, fontWeight: 600, color: "var(--text2)", marginBottom: 6, display: "block", textTransform: "uppercase", letterSpacing: ".5px" },
    inp: { width: "100%", padding: "11px 12px", background: "var(--input)", border: "1.5px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 14, outline: "none" },
    chip: (on) => ({ padding: "7px 12px", background: on ? "var(--glow)" : "var(--input)", border: `1.5px solid ${on ? "var(--accent)" : "var(--border)"}`, borderRadius: 18, fontSize: 12, color: on ? "var(--accent)" : "var(--text2)", cursor: "pointer", userSelect: "none" }),
    sizeBox: (on) => ({ padding: "6px 2px", background: on ? "var(--glow)" : "var(--card2)", border: `1.5px solid ${on ? "var(--accent)" : "var(--border)"}`, borderRadius: 8, textAlign: "center", cursor: "pointer" }),
    btn: (bg, clr) => ({ width: "100%", padding: 13, background: bg, color: clr, border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" }),
    modal: { position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(4px)" },
    sheet: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: "20px 20px 0 0", padding: "24px 20px 32px", width: "100%", maxWidth: 500, maxHeight: "85vh", overflowY: "auto" },
  };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "12px 16px", position: "relative", zIndex: 1, minHeight: "100vh" }}>

      {/* ═══ HEADER ═══ */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0 16px", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/icon.png" alt="Printium" style={{ width: 38, height: 38, borderRadius: 10, objectFit: "cover" }} />
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700 }}>Printium</h1>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: connected ? "var(--success)" : "var(--danger)", animation: "pulse 2s infinite" }} />
              <span style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>
                {mode === "cloud" ? "☁️ Cloud" : "🔌 Local"} Mode
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setPreviewOpen(true)} style={{ padding: "7px 10px", background: "var(--card2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, cursor: "pointer", color: "var(--text2)" }}>👁️</button>
          <button onClick={() => setWifiOpen(true)} style={{ padding: "7px 10px", background: "var(--card2)", border: "1px solid rgba(108,140,255,.25)", borderRadius: 8, fontSize: 12, cursor: "pointer", color: "var(--accent)" }}>📶</button>
          <button onClick={() => setSettingsOpen(true)} style={{ padding: "7px 10px", background: "var(--card2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, cursor: "pointer", color: "var(--text2)" }}>⚙️</button>
        </div>
      </header>

      {/* Mode banner */}
      {mode === "cloud" && (
        <div style={{ ...S.card, padding: 12, borderColor: "rgba(108,140,255,.2)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--accent)" }}>☁️</span>
          <span style={{ fontSize: 12, color: "var(--text2)" }}>Cloud mode — prints go to queue. Run <strong style={{ color: "var(--accent)" }}>Print Agent</strong> on PC near printer.</span>
        </div>
      )}

      {info?.mobileUrl && mode === "local" && (
        <div style={{ ...S.card, padding: 12, borderColor: "rgba(108,140,255,.15)" }}>
          <span style={{ fontSize: 12, color: "var(--text2)" }}>📱 Share: <strong style={{ color: "var(--accent)", fontFamily: "'JetBrains Mono'", fontSize: 11 }}>{info.mobileUrl}</strong></span>
        </div>
      )}

      {/* ═══ PRINTER ═══ */}
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>🖨️ Printer</span>
          <button onClick={doRefresh} style={{ fontSize: 11, color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }}>🔄 Refresh</button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select style={{ ...S.inp, flex: 1, cursor: "pointer", appearance: "none", fontSize: 13 }} value={printer} onChange={(e) => setPrinter(e.target.value)}>
            <option value="">-- Select --</option>
            {printers.filter(p => p.type === "usb").length > 0 && <optgroup label="🔌 USB">{printers.filter(p => p.type === "usb").map(p => <option key={p.name} value={p.name}>{p.name}</option>)}</optgroup>}
            {printers.filter(p => p.type === "network").length > 0 && <optgroup label="📶 WiFi">{printers.filter(p => p.type === "network").map(p => <option key={p.name} value={p.name}>{p.name}</option>)}</optgroup>}
          </select>
          <button onClick={doTest} style={{ padding: "0 14px", background: "var(--card2)", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, cursor: "pointer", color: "var(--success)" }}>🧪</button>
        </div>
        {cp.type === "network" && <span style={{ fontSize: 10, color: "var(--accent)", marginTop: 4, display: "block" }}>📶 WiFi Printer: {cp.ip}:{cp.netPort}</span>}
      </div>

      {/* ═══ LABEL SIZE ═══ */}
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>📐 Size</span>
          <span style={{ fontSize: 11, color: "var(--accent)", fontFamily: "'JetBrains Mono'", padding: "2px 8px", background: "var(--glow)", borderRadius: 10 }}>{lw}×{lh}mm</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5, marginBottom: 10 }}>
          {PRESETS.map(p => (
            <div key={p.n} onClick={() => { setLw(p.w); setLh(p.h); setShowCustom(false); }} style={S.sizeBox(lw === p.w && lh === p.h)}>
              <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, fontWeight: 600 }}>{p.w}×{p.h}</div>
              <div style={{ fontSize: 9, color: "var(--muted)" }}>{p.n}</div>
            </div>
          ))}
        </div>
        <span style={S.chip(showCustom)} onClick={() => setShowCustom(!showCustom)}>✏️ Custom mm</span>
        {showCustom && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 10 }}>
            <div><label style={{ ...S.lbl, fontSize: 10 }}>W (mm)</label><input style={S.inp} type="number" min="10" max="300" value={lw} onChange={(e) => setLw(parseFloat(e.target.value) || 50)} /></div>
            <div><label style={{ ...S.lbl, fontSize: 10 }}>H (mm)</label><input style={S.inp} type="number" min="10" max="300" value={lh} onChange={(e) => setLh(parseFloat(e.target.value) || 30)} /></div>
            <div><label style={{ ...S.lbl, fontSize: 10 }}>Gap</label><input style={S.inp} type="number" min="0" max="10" step="0.5" value={gap} onChange={(e) => setGap(parseFloat(e.target.value) || 3)} /></div>
          </div>
        )}
      </div>

      {/* ═══ LABEL CONTENT ═══ */}
      <div style={S.card}>
        <span style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 12 }}>🏷️ Label</span>

        {/* Name — always */}
        <input ref={inputRef} style={{ ...S.inp, fontSize: 16, padding: "14px 14px", marginBottom: 10 }} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doPrint()} placeholder="Product name *" autoFocus />

        {/* Font Size */}
        <div style={{ display: "flex", gap: 5, marginBottom: 12 }}>
          {[1,2,3,4,5].map(f => (
            <div key={f} onClick={() => setFontSize(f)} style={{ ...S.sizeBox(fontSize === f), flex: 1 }}>
              <span style={{ fontSize: 8 + f * 2, fontWeight: 600 }}>A</span>
            </div>
          ))}
        </div>

        {/* Feature chips */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          <span style={S.chip(barcode)} onClick={() => setBarcode(!barcode)}>📊 Barcode</span>
          <span style={S.chip(qr)} onClick={() => setQr(!qr)}>📱 QR</span>
          <span style={S.chip(dateOn)} onClick={() => setDateOn(!dateOn)}>📅 Date</span>
          <span style={S.chip(serialOn)} onClick={() => setSerialOn(!serialOn)}>#️⃣ Serial</span>
          <span style={S.chip(priceOn)} onClick={() => setPriceOn(!priceOn)}>💰 Price</span>
        </div>

        {/* Conditional fields */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          {priceOn && <div><label style={S.lbl}>Price ₹</label><input style={S.inp} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" /></div>}
          {barcode && <div><label style={S.lbl}>SKU</label><input style={S.inp} value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU-001" /></div>}
          {serialOn && <div><label style={S.lbl}>Serial</label><input style={S.inp} value={serial} onChange={(e) => setSerial(e.target.value)} /></div>}
        </div>

        {/* Copies */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: "var(--text2)" }}>Copies</span>
          <div style={{ display: "flex", alignItems: "center", background: "var(--input)", border: "1.5px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            <button onClick={() => setCopies(Math.max(1, copies - 1))} style={{ width: 36, height: 36, background: "transparent", border: "none", color: "var(--text2)", fontSize: 18, cursor: "pointer" }}>−</button>
            <input value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(999, parseInt(e.target.value) || 1)))} style={{ width: 44, textAlign: "center", fontFamily: "'JetBrains Mono'", fontSize: 15, fontWeight: 600, color: "var(--text)", border: "none", background: "transparent", outline: "none" }} />
            <button onClick={() => setCopies(Math.min(999, copies + 1))} style={{ width: 36, height: 36, background: "transparent", border: "none", color: "var(--text2)", fontSize: 18, cursor: "pointer" }}>+</button>
          </div>
        </div>

        {/* Print button */}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={doPrint} disabled={busy} style={{
            ...S.btn(busy ? "var(--card2)" : "linear-gradient(135deg,#6c8cff,#5a5ff5)", "#fff"),
            opacity: busy ? .6 : 1, boxShadow: busy ? "none" : "0 4px 20px rgba(108,140,255,.3)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            {busy ? "⏳ Printing..." : mode === "cloud" ? "📤 Send to Print" : "🖨️ Print Label"}
          </button>
          <button onClick={clear} style={{ padding: "13px 16px", background: "var(--card2)", color: "var(--text2)", border: "1.5px solid var(--border)", borderRadius: 10, fontWeight: 600, cursor: "pointer" }}>↺</button>
        </div>
      </div>

      {/* ═══ HISTORY ═══ */}
      {history.length > 0 && (
        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>📜 Recent</span>
            <button onClick={() => { setHistory([]); localStorage.removeItem("lf3"); }} style={{ fontSize: 10, color: "var(--muted)", background: "none", border: "none", cursor: "pointer" }}>Clear</button>
          </div>
          <div style={{ maxHeight: 180, overflowY: "auto" }}>
            {history.map((h, i) => (
              <div key={i} onClick={() => reprint(h)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "var(--card2)", borderRadius: 8, marginBottom: 4, cursor: "pointer" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{h.name}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'JetBrains Mono'" }}>{h.copies}x · {h.lw||50}×{h.lh||30}mm · {h.time}</div>
                </div>
                <span style={{ fontSize: 11, color: "var(--accent)" }}>↻</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ PREVIEW BOTTOM SHEET ═══ */}
      {previewOpen && (
        <div onClick={() => setPreviewOpen(false)} style={S.modal}>
          <div onClick={(e) => e.stopPropagation()} style={S.sheet}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>👁️ Label Preview</h3>
              <button onClick={() => setPreviewOpen(false)} style={{ background: "none", border: "none", color: "var(--text2)", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ background: "#fff", borderRadius: 10, padding: 24, display: "flex", justifyContent: "center" }}>
              <div style={{
                background: "#fff", color: "#111", padding: 16, fontFamily: "'JetBrains Mono',monospace",
                textAlign: "center", border: "1.5px dashed #bbb", borderRadius: 4,
                width: Math.min(280, Math.max(120, lw * 2.8)),
                minHeight: Math.min(300, Math.max(60, lh * 2.8)),
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
              }}>
                <div style={{ fontSize: 10 + fontSize * 3, fontWeight: 700, wordBreak: "break-word", lineHeight: 1.2 }}>{name || "Product Name"}</div>
                {serialOn && serial && <div style={{ fontSize: 10, color: "#666" }}>{serial}</div>}
                {dateOn && <div style={{ fontSize: 9, color: "#999" }}>{today}</div>}
                {priceOn && price && <div style={{ fontSize: 13, fontWeight: 700 }}>₹ {price}</div>}
                {barcode && <div style={{ marginTop: 4 }}><Barcode value={sku || "0000"} width={1.2} height={30} /></div>}
                {qr && <div style={{ marginTop: 4 }}><QRCodeCanvas value={`${name || "P"}|${sku || "0"}|${serial}`} size={64} /></div>}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginTop: 8, fontFamily: "'JetBrains Mono'" }}>
              <span>{lw}×{lh}mm · gap {gap}mm</span>
              <span>Font: {fontSize}</span>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SETTINGS SHEET ═══ */}
      {settingsOpen && (
        <div onClick={() => setSettingsOpen(false)} style={S.modal}>
          <div onClick={(e) => e.stopPropagation()} style={S.sheet}>
            <h3 style={{ fontSize: 16, marginBottom: 16 }}>⚙️ Settings</h3>
            <div style={{ marginBottom: 14 }}>
              <label style={S.lbl}>Default Printer</label>
              <select style={{ ...S.inp, cursor: "pointer" }} value={printer} onChange={(e) => setPrinter(e.target.value)}>
                <option value="">-- Select --</option>
                {printers.map(p => <option key={p.name} value={p.name}>{p.name} ({p.type})</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={S.lbl}>Print Method</label>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={S.chip(method === "raw")} onClick={() => setMethod("raw")}>🔌 RAW</span>
                <span style={S.chip(method === "gdi")} onClick={() => setMethod("gdi")}>🖥️ GDI</span>
              </div>
              <p style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>RAW = TSPL direct. GDI = Windows driver. WiFi always uses RAW.</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={doSave} style={{ ...S.btn("linear-gradient(135deg,var(--accent),#5a5ff5)", "#fff"), flex: 1 }}>💾 Save</button>
              <button onClick={() => setSettingsOpen(false)} style={{ padding: "13px 18px", background: "var(--card2)", color: "var(--text2)", border: "1.5px solid var(--border)", borderRadius: 10, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ WIFI SHEET ═══ */}
      {wifiOpen && (
        <div onClick={() => setWifiOpen(false)} style={S.modal}>
          <div onClick={(e) => e.stopPropagation()} style={S.sheet}>
            <h3 style={{ fontSize: 16, marginBottom: 4 }}>📶 WiFi Printer</h3>
            <p style={{ fontSize: 11, color: "var(--text2)", marginBottom: 16 }}>Add network printers (default port: 9100)</p>
            <div style={{ marginBottom: 12 }}>
              <label style={S.lbl}>Name</label>
              <input style={S.inp} value={wifiName} onChange={(e) => setWifiName(e.target.value)} placeholder="My WiFi Printer" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginBottom: 12 }}>
              <div><label style={S.lbl}>IP Address *</label><input style={S.inp} value={wifiIp} onChange={(e) => setWifiIp(e.target.value)} placeholder="192.168.1.100" /></div>
              <div><label style={S.lbl}>Port</label><input style={S.inp} type="number" value={wifiPort} onChange={(e) => setWifiPort(e.target.value)} /></div>
            </div>
            <button onClick={doAddWifi} style={{ ...S.btn("linear-gradient(135deg,var(--accent),#5a5ff5)", "#fff"), marginBottom: 16 }}>➕ Add</button>
            {printers.filter(p => p.type === "network").map((p, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--card2)", borderRadius: 8, marginBottom: 4 }}>
                <div><div style={{ fontSize: 13 }}>{p.name}</div><div style={{ fontSize: 10, fontFamily: "'JetBrains Mono'", color: "var(--muted)" }}>{p.ip}:{p.netPort}</div></div>
                <button onClick={() => doRemoveWifi(p)} style={{ padding: "3px 8px", background: "rgba(240,112,112,.1)", color: "var(--danger)", border: "none", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>✕</button>
              </div>
            ))}
            <button onClick={() => setWifiOpen(false)} style={{ ...S.btn("var(--card2)", "var(--text2)"), marginTop: 12, border: "1.5px solid var(--border)" }}>Close</button>
          </div>
        </div>
      )}

      <Toast show={toast.show} message={toast.msg} isError={toast.err} />
      <style>{`input:focus,select:focus{border-color:var(--accent)!important}`}</style>
    </div>
  );
}
