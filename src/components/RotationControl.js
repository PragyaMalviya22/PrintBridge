"use client";

const ROTATIONS = [0, 90, 180, 270];

export default function RotationControl({ value, onChange }) {
  return (
    <div>
      <label className="lbl">Rotation</label>
      <div className="rot-row">
        {ROTATIONS.map(r => (
          <button
            key={r}
            className={`rot-btn ${value === r ? "on" : ""}`}
            onClick={() => onChange(r)}
            title={`${r}°`}
            aria-pressed={value === r}
          >
            <span className="rot-icon" style={{ display: "inline-block", transform: `rotate(${r}deg)`, transition: "transform .2s" }}>
              ↑
            </span>
            <span className="rot-label">{r}°</span>
          </button>
        ))}
      </div>
    </div>
  );
}
