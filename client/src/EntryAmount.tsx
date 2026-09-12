import { useState } from "react";
export default function EntryAmount({
  name = "amount",
  initial = "25",
  value,
  onChange,
}: {
  name?: string;
  initial?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const [local, setLocal] = useState(initial);
  const current = value ?? local;
  const error =
    current !== "" && Number(current) < 10
      ? "The minimum entry amount is $10."
      : Number(current) > 2500
        ? "The maximum entry amount is $2,500."
        : "";
  function change(next: string) {
    setLocal(next);
    onChange?.(next);
  }
  return (
    <div>
      <div className="action-row amount-presets">
        {[25, 50, 100].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={Number(current) === n}
            onClick={() => change(String(n))}
          >
            {"$" + n}
          </button>
        ))}
      </div>
      <label>
        Custom entry per player ($)
        <input
          name={name}
          type="number"
          min={10}
          max={2500}
          step="0.01"
          inputMode="decimal"
          value={current}
          aria-invalid={!!error}
          onChange={(e) => change(e.target.value)}
          required
        />
      </label>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      <small>$10–$2,500 per player. No platform fee.</small>
    </div>
  );
}
