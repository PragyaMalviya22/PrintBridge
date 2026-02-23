"use client";

const ALIGNMENTS = [
  { value: "left",   icon: "⬅", label: "Left"   },
  { value: "center", icon: "↔", label: "Center" },
  { value: "right",  icon: "➡", label: "Right"  },
];

export default function AlignmentControl({ value, onChange }) {
  return (
    <div>
      <label className="lbl">Alignment</label>
      <div className="align-row">
        {ALIGNMENTS.map(a => (
          <button
            key={a.value}
            className={`align-btn ${value === a.value ? "on" : ""}`}
            onClick={() => onChange(a.value)}
            title={a.label}
            aria-pressed={value === a.value}
          >
            <span className="align-icon">{a.icon}</span>
            <span className="align-label">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
