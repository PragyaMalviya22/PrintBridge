"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { QRCodeCanvas } from "qrcode.react";
import Barcode from "@/components/Barcode";
import Toast from "@/components/Toast";
import SizeSelector       from "@/components/SizeSelector";
import FontFamilySelector from "@/components/FontFamilySelector";
import FontSizeControl    from "@/components/FontSizeControl";
import AlignmentControl   from "@/components/AlignmentControl";
import RotationControl    from "@/components/RotationControl";
import {
  getServerInfo, getPrinters, printLabel, testPrint,
  getSettings, saveSettings, addNetPrinter, removeNetPrinter,
} from "@/lib/clientApi";

/* ── Theme hook ── */
function useTheme() {
  const [theme, setTheme] = useState("light");
  useEffect(() => {
    const saved = localStorage.getItem("pm-theme") || "light";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("pm-theme", next);
  };
  return { theme, toggle };
}

export default function Home() {
  const { theme, toggle: toggleTheme } = useTheme();

  /* ── Printer / connection ── */
  const [info,      setInfo]      = useState(null);
  const [mode,      setMode]      = useState("local");
  const [printers,  setPrinters]  = useState([]);
  const [printer,   setPrinter]   = useState("");
  const [connected, setConnected] = useState(false);
  const [method,    setMethod]    = useState("raw");

  /* ── Label content ── */
  const [name,     setName]    = useState("");
  const [sku,      setSku]     = useState("");
  const [serial,   setSerial]  = useState("SN-0001");
  const [price,    setPrice]   = useState("");
  const [copies,   setCopies]  = useState(1);
  const [barcode,  setBarcode] = useState(false);
  const [qr,       setQr]      = useState(false);
  const [dateOn,   setDateOn]  = useState(false);
  const [serialOn, setSerialOn]= useState(false);
  const [priceOn,  setPriceOn] = useState(false);

  /* ── Centralised label formatting config ── */
  const [labelConfig, setLabelConfig] = useState({
    width:      50,
    height:     30,
    gap:        3,
    fontSize:   14,         // px (real pixels)
    fontFamily: "Courier New",
    alignment:  "left",
    rotation:   0,
  });
  const setLC = (patch) => setLabelConfig(prev => ({ ...prev, ...patch }));

  /* ── UI state ── */
  const [showCustom,   setShowCustom]   = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wifiOpen,     setWifiOpen]     = useState(false);
  const [wifiName,     setWifiName]     = useState("");
  const [wifiIp,       setWifiIp]       = useState("");
  const [wifiPort,     setWifiPort]     = useState("9100");
  const [history,  setHistory]  = useState([]);
  const [toast,    setToast]    = useState({ show: false, msg: "", err: false });
  const [busy,     setBusy]     = useState(false);
  const inputRef = useRef();

  const cp = printers.find(p => p.name === printer) || {};

  /* ── Init ── */
  useEffect(() => {
    (async () => {
      try {
        const i  = await getServerInfo();
        setInfo(i); setMode(i.mode || "local"); setConnected(true);
        const pd = await getPrinters();
        if (pd.printers) {
          setPrinters(pd.printers);
          setPrinter(i.settings?.defaultPrinter || pd.printers[0]?.name || "");
        }
        const s = await getSettings();
        if (s?.printMethod)  setMethod(s.printMethod);
        if (s?.labelWidth)   setLC({ width: s.labelWidth });
        if (s?.labelHeight)  setLC({ height: s.labelHeight });
      } catch { setConnected(false); }

      // Load history from Neon DB; fall back to localStorage if unavailable
      try {
        const hRes = await fetch("/api/history");
        if (hRes.ok) {
          const { jobs } = await hRes.json();
          if (Array.isArray(jobs) && jobs.length > 0) {
            setHistory(jobs.map(j => ({
              name:   j.product_name,
              sku:    j.sku,
              serial: j.serial,
              copies: j.copies,
              lw:     j.label_width,
              lh:     j.label_height,
              time:   new Date(j.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
            })));
          } else {
            throw new Error("empty");
          }
        } else throw new Error("api");
      } catch {
        // Fallback to localStorage
        try { const h = localStorage.getItem("lf3"); if (h) setHistory(JSON.parse(h)); } catch {}
      }
    })();
  }, []);

  /* ── Ctrl+P ── */
  useEffect(() => {
    const fn = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "p") { e.preventDefault(); doPrint(); } };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  });

  const notify = useCallback((m, e = false) => {
    setToast({ show: true, msg: m, err: e });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3500);
  }, []);

  const incSerial = (s, n = 1) => {
    const m = s.match(/^(.*?)(\d+)$/);
    return m ? m[1] + String(parseInt(m[2]) + n).padStart(m[2].length, "0") : s;
  };

  /* ── Print ── */
  async function doPrint() {
    if (!name.trim()) { notify("Enter product name", true); inputRef.current?.focus(); return; }
    if (mode === "local" && printers.length === 0) {
      notify("⚠️ No printer connected. Please connect a printer and click Refresh.", true);
      return;
    }
    if (mode === "local" && !printer) {
      notify("⚠️ Please select a printer before printing.", true);
      return;
    }
    setBusy(true);
    try {
      const { width, height, gap, fontSize, fontFamily, alignment, rotation } = labelConfig;
      const r = await printLabel({
        /* existing bridge fields — unchanged */
        printerName:  printer || "default",
        printerType:  cp.type  || "usb",
        printerIp:    cp.ip    || "",
        printerPort:  cp.netPort || 9100,
        text:         name.trim(),
        sku:          barcode   ? (sku    || "0000") : "",
        serial:       serialOn  ? serial  : "",
        price:        priceOn   ? price   : "",
        labelWidth:   width,
        labelHeight:  height,
        gap,
        showBarcode:  barcode,
        showQR:       qr,
        showDate:     dateOn,
        showSerial:   serialOn,
        showPrice:    priceOn,
        copies,
        method,
        /* NEW formatting fields */
        fontSize,
        fontFamily,
        alignment,
        rotation,
      });
      notify(`✅ ${r.message}`);
      const entry = { name, sku, serial, copies, lw: width, lh: height, time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) };
      const nh = [entry, ...history].slice(0, 50);
      setHistory(nh);
      try { localStorage.setItem("lf3", JSON.stringify(nh)); } catch {}
      // Save to Neon DB (fire-and-forget)
      fetch("/api/history", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id:          `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          productName: name,
          sku, serial, price, copies,
          printerName: printer || "default",
          printerType: cp.type || "usb",
          labelWidth:  width,
          labelHeight: height,
          fontFamily, fontSize, alignment, rotation,
          status: "done",
        }),
      }).catch(() => {}); // silent — don't block UI
      if (serialOn) setSerial(incSerial(serial, copies));
    } catch (e) { notify(e.response?.data?.error || "Print failed", true); }
    setBusy(false);
  }

  async function doTest() {
    if (mode === "local" && !printer) return notify("Select printer", true);
    try {
      const { width, height, gap } = labelConfig;
      const r = await testPrint({ printerName: printer || "default", printerType: cp.type, printerIp: cp.ip, printerPort: cp.netPort, labelWidth: width, labelHeight: height, gap });
      notify(r.message);
    } catch { notify("Test failed", true); }
  }

  async function doRefresh() {
    try { const d = await getPrinters(); setPrinters(d.printers || []); notify(`Found ${d.printers?.length || 0} printers`); }
    catch { notify("Could not fetch", true); }
  }

  async function doSave() {
    const { width, height } = labelConfig;
    try { await saveSettings({ defaultPrinter: printer, labelWidth: width, labelHeight: height, printMethod: method }); notify("Saved!"); setSettingsOpen(false); }
    catch { notify("Failed", true); }
  }

  async function doAddWifi() {
    if (!wifiIp.trim()) return notify("Enter IP", true);
    try {
      await addNetPrinter({ name: wifiName || `WiFi: ${wifiIp}`, ip: wifiIp.trim(), port: parseInt(wifiPort) || 9100 });
      notify(`Added ${wifiIp}`); setWifiName(""); setWifiIp(""); setWifiPort("9100"); setWifiOpen(false); doRefresh();
    } catch (e) { notify(e.response?.data?.error || "Failed", true); }
  }

  async function doRemoveWifi(p) {
    try { await removeNetPrinter({ ip: p.ip, port: p.netPort }); notify("Removed"); doRefresh(); }
    catch { notify("Failed", true); }
  }

  const reprint = (h) => {
    setName(h.name); setSku(h.sku || ""); setSerial(h.serial || "SN-0001"); setCopies(h.copies || 1);
    if (h.lw) setLC({ width: h.lw, height: h.lh });
  };
  const clear = () => { setName(""); setSku(""); setSerial("SN-0001"); setPrice(""); setCopies(1); inputRef.current?.focus(); };
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  /* ── Derived preview dimensions (px) — capped for display ── */
  const { width: lw, height: lh, gap, fontSize, fontFamily, alignment, rotation } = labelConfig;
  const PX_PER_MM = 3.78;
  const previewW = Math.min(280, Math.max(110, lw * PX_PER_MM * 0.7));
  const previewH = Math.min(320, Math.max(55,  lh * PX_PER_MM * 0.7));

  const [settingsExpanded, setSettingsExpanded] = useState(false);

  return (
    <div className="app-shell">

      {/* ══════════════════════════════════════
          STICKY TOP BAR
         ══════════════════════════════════════ */}
      <header className="header sticky-header">
        <div className="page-wrapper" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "0 16px" }}>
          <div className="header-brand">
            <img src="/icon.png" alt="Printium" className="header-logo" />
            <div>
              <h1 className="header-title">Printium</h1>
              <div className="header-status">
                <div className={`status-dot ${connected ? "online" : "offline"}`} />
                <span className="status-label">
                  {mode === "cloud" ? "☁️ Cloud" : "🔌 Local"} Mode
                </span>
              </div>
            </div>
          </div>
          <div className="header-actions">
            <button className="theme-btn" onClick={toggleTheme}
              title={theme === "dark" ? "Switch to Light" : "Switch to Dark"} aria-label="Toggle theme">
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <button className="btn-inline accent" onClick={() => setWifiOpen(true)}>📶</button>
            <button className="btn-inline" onClick={() => setSettingsOpen(true)}>⚙️</button>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════
          MAIN CONTENT
         ══════════════════════════════════════ */}
      <div className="page-wrapper">

        {/* ── Banners ── */}
        {mode === "cloud" && (
          <div className="banner cloud">
            <span style={{ fontSize: 12, color: "var(--accent)" }}>☁️</span>
            <span className="banner-text">Cloud mode — Run <strong style={{ color: "var(--accent)" }}>Print Agent</strong> on PC near printer.</span>
          </div>
        )}
        {info?.mobileUrl && mode === "local" && (
          <div className="banner share">
            <span className="banner-text">📱 Share: <strong className="banner-mono">{info.mobileUrl}</strong></span>
          </div>
        )}

        {/* ══════════════════════════════════════
            RESPONSIVE TWO-COLUMN GRID
            Desktop: left 65% | right 35%
            Mobile: single column
           ══════════════════════════════════════ */}
        <div className="content-grid">

          {/* ════════════════════════════════════
              LEFT COLUMN — Preview + Label editor
             ════════════════════════════════════ */}
          <div className="col-left">

            {/* ── Live WYSIWYG Preview ── */}
            <div className="preview-panel">
              <div className="flex-between mb-12">
                <span style={{ fontSize: 13, fontWeight: 600 }}>👁️ Preview</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="badge-mono">{lw}×{lh}mm</span>
                  {rotation > 0 && <span className="badge-mono">{rotation}°</span>}
                </div>
              </div>
              <div className="preview-stage">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", transition: "transform .3s ease" }}>
                  <div
                    className="preview-label"
                    style={{
                      width: previewW,
                      minHeight: previewH,
                      fontFamily,
                      textAlign: alignment,
                      transform: `rotate(${rotation}deg)`,
                      transition: "transform .3s ease, width .2s, min-height .2s",
                    }}
                  >
                    <div style={{ width: "100%", fontSize, fontWeight: 700, wordBreak: "break-word", lineHeight: 1.2 }}>
                      {name || "Product Name"}
                    </div>
                    {serialOn && serial && <div style={{ fontSize: Math.max(8, fontSize * 0.65), color: "#666", width: "100%" }}>{serial}</div>}
                    {dateOn   && <div style={{ fontSize: Math.max(7, fontSize * 0.6),  color: "#999", width: "100%" }}>{today}</div>}
                    {priceOn  && price  && <div style={{ fontSize: Math.max(10, fontSize * 0.85), fontWeight: 700, width: "100%" }}>₹ {price}</div>}
                    {barcode  && <div style={{ marginTop: 4 }}><Barcode value={sku || "0000"} width={1.2} height={30} /></div>}
                    {qr       && <div style={{ marginTop: 4 }}><QRCodeCanvas value={`${name||"P"}|${sku||"0"}|${serial}`} size={64} /></div>}
                  </div>
                </div>
              </div>
              <div className="preview-footer">
                <span>{lw}×{lh}mm · gap {gap}mm</span>
                <span>{fontFamily} · {fontSize}px · {alignment}</span>
              </div>
            </div>

            {/* ── Label Editor ── */}
            <div className="card">
              <span style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 12 }}>🏷️ Label</span>

              <input
                ref={inputRef}
                className="inp inp-lg mb-10"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && doPrint()}
                placeholder="Product name *"
                autoFocus
              />

              {/* Feature chips */}
              <div className="flex-wrap mb-12">
                <span className={`chip ${barcode  ? "on":""}`} onClick={() => setBarcode(!barcode)}>📊 Barcode</span>
                <span className={`chip ${qr       ? "on":""}`} onClick={() => setQr(!qr)}>📱 QR</span>
                <span className={`chip ${dateOn   ? "on":""}`} onClick={() => setDateOn(!dateOn)}>📅 Date</span>
                <span className={`chip ${serialOn ? "on":""}`} onClick={() => setSerialOn(!serialOn)}>#️⃣ Serial</span>
                <span className={`chip ${priceOn  ? "on":""}`} onClick={() => setPriceOn(!priceOn)}>💰 Price</span>
              </div>

              {/* Conditional fields */}
              {(priceOn || barcode || serialOn) && (
                <div className="grid-2 mb-10">
                  {priceOn  && <div><label className="lbl">Price ₹</label><input className="inp" value={price}  onChange={e => setPrice(e.target.value)}  placeholder="0.00" /></div>}
                  {barcode  && <div><label className="lbl">SKU</label>    <input className="inp" value={sku}    onChange={e => setSku(e.target.value)}    placeholder="SKU-001" /></div>}
                  {serialOn && <div><label className="lbl">Serial</label>  <input className="inp" value={serial} onChange={e => setSerial(e.target.value)} /></div>}
                </div>
              )}

              {/* Copies + Print */}
              <div className="flex-row mb-14">
                <span style={{ fontSize: 12, color: "var(--text2)" }}>Copies</span>
                <div className="copies-counter">
                  <button className="copies-btn" onClick={() => setCopies(Math.max(1, copies - 1))}>−</button>
                  <input className="copies-input" value={copies} onChange={e => setCopies(Math.max(1, Math.min(999, parseInt(e.target.value) || 1)))} />
                  <button className="copies-btn" onClick={() => setCopies(Math.min(999, copies + 1))}>+</button>
                </div>
              </div>

              <div className="btn-row">
                <button className="btn btn-primary flex-1" onClick={doPrint} disabled={busy}>
                  {busy ? "⏳ Printing…" : mode === "cloud" ? "📤 Send to Print" : "🖨️ Print Label"}
                </button>
                <button className="btn-row btn-clear" onClick={clear}>↺</button>
              </div>
            </div>

          </div>{/* /col-left */}

          {/* ════════════════════════════════════
              RIGHT COLUMN — Settings + Recent
              Mobile: wrapped in collapsible accordion
             ════════════════════════════════════ */}
          <div className="col-right">

            {/* ── Mobile Settings Accordion toggle ── */}
            <button
              className={`settings-accordion-btn ${settingsExpanded ? "open" : ""}`}
              onClick={() => setSettingsExpanded(!settingsExpanded)}
              aria-expanded={settingsExpanded}
            >
              <span>⚙️ Settings</span>
              <span className="accordion-chevron">{settingsExpanded ? "▲" : "▼"}</span>
            </button>

            {/* Settings panels: always visible on desktop, toggled on mobile */}
            <div className={`settings-panels ${settingsExpanded ? "expanded" : ""}`}>

              {/* ── Printer ── */}
              <div className="card">
                <div className="card-head">
                  <span className="card-head-title">🖨️ Printer</span>
                  <button className="btn-icon" onClick={doRefresh}>🔄 Refresh</button>
                </div>

                {/* No-printer warning — local mode only */}
                {mode === "local" && printers.length === 0 && (
                  <div className="no-printer-alert">
                    <div className="no-printer-icon">🖨️</div>
                    <div className="no-printer-body">
                      <div className="no-printer-title">No Printer Connected</div>
                      <div className="no-printer-msg">
                        Connect a USB or WiFi printer, then click&nbsp;
                        <strong>Refresh</strong> to detect it.
                      </div>
                    </div>
                    <button className="btn-inline" onClick={doRefresh} style={{ flexShrink: 0 }}>🔄</button>
                  </div>
                )}

                {printers.length > 0 && (
                  <div className="flex-row">
                    <select className="inp inp-select flex-1" value={printer} onChange={e => setPrinter(e.target.value)}>
                      <option value="">-- Select --</option>
                      {printers.filter(p => p.type === "usb").length > 0 && (
                        <optgroup label="🔌 USB">
                          {printers.filter(p => p.type === "usb").map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                        </optgroup>
                      )}
                      {printers.filter(p => p.type === "network").length > 0 && (
                        <optgroup label="📶 WiFi">
                          {printers.filter(p => p.type === "network").map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                        </optgroup>
                      )}
                    </select>
                    <button className="btn-inline" onClick={doTest} style={{ color: "var(--success)" }}>🧪</button>
                  </div>
                )}
                {printers.length > 0 && cp.type === "network" && <span className="wifi-badge">📶 {cp.ip}:{cp.netPort}</span>}
              </div>

              {/* ── Label Size ── */}
              <div className="card">
                <div className="card-head mb-12">
                  <span className="card-head-title">📐 Size</span>
                  <span className="badge-mono">{lw}×{lh}mm</span>
                </div>
                <SizeSelector
                  lw={lw} lh={lh} gap={gap}
                  showCustom={showCustom}
                  onSelect={(w, h) => setLC({ width: w, height: h })}
                  onToggleCustom={setShowCustom}
                  onGapChange={v => setLC({ gap: v })}
                  onLwChange={v => setLC({ width: v })}
                  onLhChange={v => setLC({ height: v })}
                />
              </div>

              {/* ── Format Toolbar ── */}
              <div className="card">
                <div className="section-label">🎨 Formatting</div>
                <div className="fmt-toolbar">
                  <div className="fmt-group">
                    <FontFamilySelector value={fontFamily} onChange={v => setLC({ fontFamily: v })} />
                  </div>
                  <div className="fmt-group">
                    <FontSizeControl value={fontSize} onChange={v => setLC({ fontSize: v })} />
                  </div>
                  <div className="fmt-group" style={{ minWidth: 160 }}>
                    <AlignmentControl value={alignment} onChange={v => setLC({ alignment: v })} />
                  </div>
                  <div className="fmt-group" style={{ minWidth: 200 }}>
                    <RotationControl value={rotation} onChange={v => setLC({ rotation: v })} />
                  </div>
                </div>
              </div>

            </div>{/* /settings-panels */}

            {/* ── Recent (always visible) ── */}
            {history.length > 0 && (
              <div className="card mb-0">
                <div className="flex-between mb-10">
                  <span style={{ fontSize: 13, fontWeight: 600 }}>📜 Recent</span>
                  <button className="btn-icon" style={{ fontSize: 10, color: "var(--muted)" }}
                    onClick={() => { setHistory([]); localStorage.removeItem("lf3"); }}>
                    Clear
                  </button>
                </div>
                <div className="history-list">
                  {history.map((h, i) => (
                    <div key={i} className="history-item" onClick={() => reprint(h)}>
                      <div>
                        <div className="history-name">{h.name}</div>
                        <div className="history-meta">{h.copies}x · {h.lw||50}×{h.lh||30}mm · {h.time}</div>
                      </div>
                      <span className="history-reprint">↻</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>{/* /col-right */}
        </div>{/* /content-grid */}

      </div>{/* /page-wrapper */}

      {/* ═══ SETTINGS MODAL ═══ */}
      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-drag" />
            <div className="modal-head">
              <h3 className="modal-title">⚙️ Settings</h3>
              <button className="modal-close" onClick={() => setSettingsOpen(false)}>✕</button>
            </div>
            <div className="modal-field">
              <label className="lbl">Default Printer</label>
              {printers.length > 0 ? (
                <select className="inp inp-select" value={printer} onChange={e => setPrinter(e.target.value)}>
                  <option value="">-- Select --</option>
                  {printers.map(p => <option key={p.name} value={p.name}>{p.name} ({p.type})</option>)}
                </select>
              ) : (
                <div style={{ padding: "10px 12px", background: "var(--input)", border: "1.5px solid var(--border)", borderRadius: "var(--radius-input)", fontSize: 13, color: "var(--muted)" }}>
                  🖨️ No printer connected — connect one and click Refresh
                </div>
              )}
            </div>
            <div className="modal-field">
              <label className="lbl">Print Method</label>
              <div className="flex-wrap mb-8">
                <span className={`chip ${method === "raw" ? "on" : ""}`} onClick={() => setMethod("raw")}>🔌 RAW</span>
                <span className={`chip ${method === "gdi" ? "on" : ""}`} onClick={() => setMethod("gdi")}>🖥️ GDI</span>
              </div>
              <p className="text-muted">RAW = TSPL direct. GDI = Windows driver. WiFi always uses RAW.</p>
            </div>
            <div className="btn-row">
              <button className="btn btn-accent flex-1" onClick={doSave}>💾 Save</button>
              <button className="btn btn-ghost" style={{ width:"auto", padding:"13px 18px" }} onClick={() => setSettingsOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ WIFI MODAL ═══ */}
      {wifiOpen && (
        <div className="modal-backdrop" onClick={() => setWifiOpen(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-drag" />
            <div className="modal-head">
              <h3 className="modal-title">📶 WiFi Printer</h3>
              <button className="modal-close" onClick={() => setWifiOpen(false)}>✕</button>
            </div>
            <p className="text-sm" style={{ color:"var(--text2)", marginBottom:16 }}>Add network printers (default port: 9100)</p>
            <div className="modal-field">
              <label className="lbl">Name</label>
              <input className="inp" value={wifiName} onChange={e => setWifiName(e.target.value)} placeholder="My WiFi Printer" />
            </div>
            <div className="grid-2-1 mb-12">
              <div><label className="lbl">IP Address *</label><input className="inp" value={wifiIp} onChange={e => setWifiIp(e.target.value)} placeholder="192.168.1.100" /></div>
              <div><label className="lbl">Port</label><input className="inp" type="number" value={wifiPort} onChange={e => setWifiPort(e.target.value)} /></div>
            </div>
            <button className="btn btn-accent mb-16" onClick={doAddWifi}>➕ Add Printer</button>
            {printers.filter(p => p.type === "network").map((p, i) => (
              <div key={i} className="net-printer-row">
                <div>
                  <div className="net-printer-name">{p.name}</div>
                  <div className="net-printer-addr">{p.ip}:{p.netPort}</div>
                </div>
                <button className="btn-sm" onClick={() => doRemoveWifi(p)}>✕</button>
              </div>
            ))}
            <button className="btn btn-ghost mt-12" onClick={() => setWifiOpen(false)}>Close</button>
          </div>
        </div>
      )}

      <Toast show={toast.show} message={toast.msg} isError={toast.err} />
    </div>
  );
}
