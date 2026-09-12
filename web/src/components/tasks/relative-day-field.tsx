import { useState } from "react";

export function RelativeDayField({ label, value, onChange, invalid = false, describedBy }: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [direction, setDirection] = useState(-1);
  return <div className="relative-day-field">
    <label><span>{label}</span><input type="number" min="0" max="3650" step="1" inputMode="numeric"
      aria-invalid={invalid || undefined} aria-describedby={describedBy}
      value={value === null ? "" : Math.abs(value)} placeholder="未設定"
      onChange={(event) => {
        const next = event.currentTarget.valueAsNumber;
        if (!Number.isNaN(next) && (next < 0 || next > 3650 || !Number.isInteger(next))) return;
        onChange(Number.isNaN(next) ? null : next * (value !== null && value !== 0 ? Math.sign(value) : direction));
      }} /></label>
    <label><span className="sr-only">{label}の前後</span><select aria-label={`${label}の前後`}
      value={value !== null && value !== 0 ? Math.sign(value) : direction}
      onChange={(event) => {
        const next = Number(event.target.value);
        setDirection(next);
        if (value !== null) onChange(Math.abs(value) * next);
      }}>
      <option value={-1}>日前</option><option value={1}>日後</option>
    </select></label>
  </div>;
}
