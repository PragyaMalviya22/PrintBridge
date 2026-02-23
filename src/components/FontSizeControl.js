"use client";

export default function FontSizeControl({ value, onChange }) {
  const dec = () => onChange(Math.max(6,   value - 1));
  const inc = () => onChange(Math.min(200, value + 1));

  return (
    <div>
      <label className="lbl">Font Size</label>
      <div className="fsc-row">
        <button className="fsc-btn" onClick={dec} aria-label="Decrease font size">−</button>
        <input
          className="fsc-val"
          type="number"
          min="6"
          max="200"
          value={value}
          onChange={e => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) onChange(Math.min(200, Math.max(6, v)));
          }}
        />
        <span className="fsc-unit">px</span>
        <button className="fsc-btn" onClick={inc} aria-label="Increase font size">+</button>
      </div>
    </div>
  );
}
