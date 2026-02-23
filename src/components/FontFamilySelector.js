"use client";

const FONTS = [
  "Courier New",
  "Arial",
  "Helvetica",
  "Verdana",
  "Times New Roman",
  "Georgia",
  "Trebuchet MS",
  "Monospace",
];

export default function FontFamilySelector({ value, onChange }) {
  return (
    <div>
      <label className="lbl">Font Family</label>
      <select
        className="inp inp-select"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ fontFamily: value }}
      >
        {FONTS.map(f => (
          <option key={f} value={f} style={{ fontFamily: f }}>
            {f}
          </option>
        ))}
      </select>
    </div>
  );
}
