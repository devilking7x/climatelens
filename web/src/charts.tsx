interface Series {
  label: string;
  values: Array<number | null>;
  color: string;
  dashed?: boolean;
}

interface Props {
  series: Series[];
  labels: string[];
  height?: number;
  unit?: string;
}

/** Minimal dependency-free SVG line chart. */
export default function LineChart({ series, labels, height = 180, unit = "°C" }: Props) {
  const W = 640;
  const H = height;
  const padL = 44;
  const padR = 12;
  const padT = 14;
  const padB = 26;

  const all = series.flatMap((s) => s.values).filter((v): v is number => v != null);
  if (!all.length) return <div className="text-sm opacity-60">No data</div>;
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min || 1;

  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const n = Math.max(...series.map((s) => s.values.length), 1);
  const x = (i: number) => padL + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => padT + ih - ((v - min) / span) * ih;

  const ticks = 4;
  const gridYs = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = min + (span * i) / ticks;
    return { v, y: y(v) };
  });

  const labelEvery = Math.max(1, Math.ceil(n / 8));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="temperature chart">
      {gridYs.map((g, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={g.y} y2={g.y} stroke="rgba(94,234,212,0.12)" strokeWidth={1} />
          <text x={padL - 6} y={g.y + 4} textAnchor="end" fontSize={11} fill="rgba(232,245,240,0.55)">
            {g.v.toFixed(0)}{unit}
          </text>
        </g>
      ))}
      {series.map((s, si) => {
        const pts = s.values
          .map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
          .filter(Boolean)
          .join(" ");
        return (
          <polyline
            key={si}
            points={pts}
            fill="none"
            stroke={s.color}
            strokeWidth={2.2}
            strokeDasharray={s.dashed ? "5 4" : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        );
      })}
      {labels.map((l, i) =>
        i % labelEvery === 0 ? (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="rgba(232,245,240,0.5)">
            {l.slice(5)}
          </text>
        ) : null
      )}
    </svg>
  );
}
