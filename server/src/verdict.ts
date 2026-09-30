// Climate verdict statistics + tamper-evident report hash.
import { createHash } from "node:crypto";
import type { DayPoint } from "./openmeteo.js";

export interface Verdict {
  days: number;
  avgHighC: number | null;
  avgLowC: number | null;
  rainDays: number;
  totalRainMm: number | null;
  hotDays: number; // days with tmax >= 35C
  trendPer30dC: number | null; // fitted change of daily highs across the window
}

function avg(xs: Array<number | null>): number | null {
  const v = xs.filter((x): x is number => typeof x === "number");
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function round1(x: number | null): number | null {
  return x == null ? null : Math.round(x * 10) / 10;
}

/** Least-squares slope of y over x=0..n-1, scaled to change over the window. */
function trendPerWindow(ys: Array<number | null>): number | null {
  const v = ys.filter((y): y is number => typeof y === "number");
  if (v.length < 10) return null;
  const n = v.length;
  const mx = (n - 1) / 2;
  const my = v.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (v[i] - my);
    den += (i - mx) * (i - mx);
  }
  if (!den) return null;
  return (num / den) * n; // total fitted change across the observed window
}

export function computeVerdict(history: DayPoint[]): Verdict {
  const highs = history.map((d) => d.tmax);
  const lows = history.map((d) => d.tmin);
  const rains = history.map((d) => d.rainMm);
  const rainVals = rains.filter((r): r is number => typeof r === "number");
  return {
    days: history.length,
    avgHighC: round1(avg(highs)),
    avgLowC: round1(avg(lows)),
    rainDays: rainVals.filter((r) => r >= 1).length,
    totalRainMm: round1(rainVals.length ? rainVals.reduce((a, b) => a + b, 0) : null),
    hotDays: highs.filter((t) => typeof t === "number" && t >= 35).length,
    trendPer30dC: round1(trendPerWindow(highs)),
  };
}

/**
 * SHA-256 fingerprint of the canonical report payload.
 * This is a tamper-evident fingerprint for the Climate Data &
 * Environmental Monitoring track (data verification), computed
 * locally — not a blockchain transaction.
 */
export function reportHash(canonical: unknown): string {
  const json = JSON.stringify(canonical);
  return "sha256:" + createHash("sha256").update(json, "utf8").digest("hex");
}
