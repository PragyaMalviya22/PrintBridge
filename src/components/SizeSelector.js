"use client";

const STANDARD_SIZES = [
  // Quick label presets
  { group: "Label Presets", name: "Tiny 25×15",       w: 25,  h: 15  },
  { group: "Label Presets", name: "Mini 38×12",        w: 38,  h: 12  },
  { group: "Label Presets", name: "Small 38×25",       w: 38,  h: 25  },
  { group: "Label Presets", name: "Medium 50×25",      w: 50,  h: 25  },
  { group: "Label Presets", name: "Standard 50×30",    w: 50,  h: 30  },
  { group: "Label Presets", name: "Large 75×50",       w: 75,  h: 50  },
  { group: "Label Presets", name: "XL 100×50",         w: 100, h: 50  },
  { group: "Label Presets", name: "XXL 100×75",        w: 100, h: 75  },
  { group: "Label Presets", name: "Square 100×100",    w: 100, h: 100 },
  // ISO A-series
  { group: "ISO Paper",     name: "A4  210×297",       w: 210, h: 297 },
  { group: "ISO Paper",     name: "A5  148×210",       w: 148, h: 210 },
  { group: "ISO Paper",     name: "A6  105×148",       w: 105, h: 148 },
  { group: "ISO Paper",     name: "A7   74×105",       w: 74,  h: 105 },
  // Thermal receipt
  { group: "Thermal Receipt", name: "80mm Receipt (Retail)", w: 80, h: 200 },
  { group: "Thermal Receipt", name: "80mm Long Receipt",     w: 80, h: 300 },
  { group: "Thermal Receipt", name: "58mm Receipt",          w: 58, h: 150 },
  // Professional labels
  { group: "Label Sizes",   name: "Shipping 100×150",   w: 100, h: 150 },
  { group: "Label Sizes",   name: "Barcode  75×50",     w: 75,  h: 50  },
  { group: "Label Sizes",   name: "Product  50×25",     w: 50,  h: 25  },
  { group: "Label Sizes",   name: "Price Tag 40×30",    w: 40,  h: 30  },
];

export default function SizeSelector({ lw, lh, onSelect, showCustom, onToggleCustom, gap, onGapChange, onLwChange, onLhChange }) {
  const currentMatch = STANDARD_SIZES.find(s => s.w === lw && s.h === lh);

  // Group sizes for optgroup rendering
  const groups = STANDARD_SIZES.reduce((acc, s) => {
    if (!acc[s.group]) acc[s.group] = [];
    acc[s.group].push(s);
    return acc;
  }, {});

  return (
    <div>
      {/* Dropdown */}
      <div className="flex-row mb-10">
        <select
          className="inp inp-select flex-1"
          value={currentMatch ? `${currentMatch.w}x${currentMatch.h}` : "custom"}
          onChange={e => {
            if (e.target.value === "custom") { onToggleCustom(true); return; }
            const [w, h] = e.target.value.split("x").map(Number);
            onSelect(w, h);
            onToggleCustom(false);
          }}
        >
          <option value="custom">✏️ Custom Size…</option>
          {Object.entries(groups).map(([group, sizes]) => (
            <optgroup key={group} label={group}>
              {sizes.map(s => (
                <option key={`${s.w}x${s.h}`} value={`${s.w}x${s.h}`}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="badge-mono">{lw}×{lh}mm</span>
      </div>

      {/* Quick preset chips — first 8 label presets */}
      <div className="grid-4 mb-10">
        {STANDARD_SIZES.filter(s => s.group === "Label Presets").map(p => (
          <div
            key={p.name}
            className={`size-box ${lw === p.w && lh === p.h ? "on" : ""}`}
            onClick={() => { onSelect(p.w, p.h); onToggleCustom(false); }}
          >
            <div className="size-box-label">{p.w}×{p.h}</div>
            <div className="size-box-sub">{p.name.split(" ")[0]}</div>
          </div>
        ))}
      </div>

      {/* Custom inputs */}
      {showCustom && (
        <div className="grid-3 mt-10">
          <div>
            <label className="lbl" style={{ fontSize: 10 }}>W (mm)</label>
            <input className="inp" type="number" min="10" max="300" value={lw}
              onChange={e => onLwChange(parseFloat(e.target.value) || 50)} />
          </div>
          <div>
            <label className="lbl" style={{ fontSize: 10 }}>H (mm)</label>
            <input className="inp" type="number" min="10" max="300" value={lh}
              onChange={e => onLhChange(parseFloat(e.target.value) || 30)} />
          </div>
          <div>
            <label className="lbl" style={{ fontSize: 10 }}>Gap</label>
            <input className="inp" type="number" min="0" max="10" step="0.5" value={gap}
              onChange={e => onGapChange(parseFloat(e.target.value) || 3)} />
          </div>
        </div>
      )}
      <span
        className={`chip ${showCustom ? "on" : ""}`}
        style={{ marginTop: 8, display: "inline-block" }}
        onClick={() => onToggleCustom(!showCustom)}
      >
        ✏️ Custom mm
      </span>
    </div>
  );
}
