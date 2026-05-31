"use client";

export function RateBar({ remainingMs, limitMs, fmtTime }: {
  remainingMs: number;
  limitMs: number;
  fmtTime: (ms: number) => string;
}) {
  const pct = Math.max(0, (remainingMs / limitMs) * 100);
  const low = pct < 25;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>Demo quota · per hour</span>
        <span style={{ fontSize: 11, fontWeight: 500, color: low ? "var(--red)" : "var(--ink-2)" }}>
          {fmtTime(remainingMs)} remaining
        </span>
      </div>
      <div style={{ height: 2, borderRadius: 99, background: "var(--border)" }}>
        <div style={{
          height: 2, borderRadius: 99, width: `${pct}%`,
          background: low ? "var(--red)" : "var(--indigo)",
          transition: "width 0.5s ease",
        }} />
      </div>
    </div>
  );
}
