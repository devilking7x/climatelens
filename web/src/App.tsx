import { useEffect, useRef, useState } from "react";
import { AQI_BAND, STR, type Lang } from "./i18n";
import { fetchClimate, searchPlaces, type ClimateReport, type GeoHit } from "./api";
import LineChart from "./charts";

const AQI_COLORS: Record<string, string> = {
  good: "#34d399",
  moderate: "#fbbf24",
  "unhealthy-sensitive": "#fb923c",
  unhealthy: "#f87171",
  "very-unhealthy": "#c084fc",
  hazardous: "#f43f5e",
  unknown: "#94a3b8",
};

const MAX_COMPARE = 3;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Clipboard copy with legacy fallback (non-secure contexts). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// Shareable report link: #r=lat,lon,urlencoded-name
function encodeShare(r: ClimateReport): string {
  return `#r=${r.place.latitude},${r.place.longitude},${encodeURIComponent(r.place.name)}`;
}

function decodeShare(hash: string): { lat: number; lon: number; name: string } | null {
  if (!hash.startsWith("#r=")) return null;
  const rest = hash.slice(3);
  const c1 = rest.indexOf(",");
  const c2 = rest.indexOf(",", c1 + 1);
  if (c1 < 0 || c2 < 0) return null;
  const lat = Number(rest.slice(0, c1));
  const lon = Number(rest.slice(c1 + 1, c2));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  let name = "";
  try {
    name = decodeURIComponent(rest.slice(c2 + 1));
  } catch {
    return null;
  }
  if (!name.trim()) return null;
  return { lat, lon, name: name.slice(0, 120) };
}

export default function App() {
  const [lang, setLang] = useState<Lang>("en");
  const t = STR[lang];
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 350);
  const [hits, setHits] = useState<GeoHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [report, setReport] = useState<ClimateReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hashCopied, setHashCopied] = useState(false);
  const [linkMsg, setLinkMsg] = useState<"copied" | "failed" | "">("");
  const [compare, setCompare] = useState<ClimateReport[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [compareNote, setCompareNote] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const searchSeq = useRef(0);
  const pickSeq = useRef(0);
  const autoRef = useRef(false);

  useEffect(() => {
    document.documentElement.lang = lang === "hi" ? "hi" : "en";
    document.title = lang === "hi" ? "ClimateLens — AI jalvayu sahayak" : "ClimateLens — AI climate assistant";
  }, [lang]);

  // Autocomplete search — stale responses are discarded via sequence token.
  useEffect(() => {
    const id = ++searchSeq.current;
    if (dq.trim().length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchPlaces(dq.trim())
      .then((r) => {
        if (id !== searchSeq.current) return;
        setHits(r);
        setActiveIdx(-1);
        setOpen(true);
      })
      .catch(() => {
        if (id !== searchSeq.current) return;
        setHits([]);
      })
      .finally(() => {
        if (id === searchSeq.current) setSearching(false);
      });
  }, [dq]);

  async function loadReport(lat: number, lon: number, name: string) {
    const id = ++pickSeq.current;
    setLoading(true);
    setError("");
    setReport(null);
    setShowCompare(false);
    try {
      window.history.replaceState(null, "", encodeShare({ place: { name, latitude: lat, longitude: lon } } as ClimateReport));
    } catch {
      /* history API unavailable — non-fatal */
    }
    try {
      const r = await fetchClimate(lat, lon, name);
      if (id !== pickSeq.current) return; // superseded by a newer pick
      setReport(r);
    } catch (e) {
      if (id !== pickSeq.current) return;
      setError(e instanceof Error ? e.message : t.loadError);
    } finally {
      if (id === pickSeq.current) setLoading(false);
    }
  }

  function pick(h: GeoHit) {
    setOpen(false);
    setActiveIdx(-1);
    setQ(h.name);
    void loadReport(h.latitude, h.longitude, h.name);
  }

  // Open a shared link directly: #r=lat,lon,name
  useEffect(() => {
    if (autoRef.current) return;
    autoRef.current = true;
    const s = decodeShare(window.location.hash);
    if (s) {
      setQ(s.name);
      void loadReport(s.lat, s.lon, s.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIdx(-1);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        if (hits.length) setOpen(true);
        return;
      }
      if (!hits.length) return;
      setActiveIdx((i) => {
        const n = hits.length;
        return e.key === "ArrowDown" ? (i + 1) % n : (i - 1 + n) % n;
      });
    } else if (e.key === "Enter") {
      if (open && activeIdx >= 0 && hits[activeIdx]) {
        e.preventDefault();
        pick(hits[activeIdx]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIdx(-1);
    }
  }

  async function onCopyHash() {
    if (!report) return;
    const ok = await copyText(report.verificationHash);
    if (ok) {
      setHashCopied(true);
      setTimeout(() => setHashCopied(false), 1500);
    }
  }

  async function onCopyLink() {
    setLinkMsg("");
    const ok = await copyText(window.location.href);
    setLinkMsg(ok ? "copied" : "failed");
    setTimeout(() => setLinkMsg(""), 2000);
  }

  function addToCompare(r: ClimateReport) {
    if (compare.some((c) => c.place.latitude === r.place.latitude && c.place.longitude === r.place.longitude)) {
      setShowCompare(true);
      return;
    }
    if (compare.length >= MAX_COMPARE) {
      setCompareNote(t.compareFull);
      setShowCompare(true);
      return;
    }
    setCompareNote("");
    setCompare([...compare, r]);
    setShowCompare(true);
  }

  function removeFromCompare(i: number) {
    setCompare(compare.filter((_, j) => j !== i));
  }

  function verdictText(r: ClimateReport): string {
    const v = r.verdict;
    const t30 = v.trendPer30dC;
    const trend =
      t30 == null ? t.steady
      : t30 > 0.5 ? `${t.warming} (+${t30}${t.per30d})`
      : t30 < -0.5 ? `${t.cooling} (${t30}${t.per30d})`
      : t.steady;
    if (lang === "hi") {
      return `Pichhle ${v.days} dinon me ${r.place.name} me ausat adhiktam ${v.avgHighC ?? "?"}°C aur ausat nyuntam ${v.avgLowC ?? "?"}°C raha. ${v.rainDays} din barish hui (kul ${v.totalRainMm ?? "?"} mm), ${v.hotDays} din 35°C se zyada garmi rahi. Rujhan: ${trend}.`;
    }
    return `Over the last ${v.days} days in ${r.place.name}, the average high was ${v.avgHighC ?? "?"}°C and average low ${v.avgLowC ?? "?"}°C. It rained on ${v.rainDays} days (${v.totalRainMm ?? "?"} mm total), with ${v.hotDays} days above 35°C. Trend: ${trend}.`;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-teal-200/15">
        <div className="max-w-5xl mx-auto px-4 py-5 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              <span className="teal-text">ClimateLens</span>
            </h1>
            <p className="text-xs sm:text-sm opacity-70 mt-1">{t.tagline}</p>
          </div>
          <button
            onClick={() => setLang(lang === "en" ? "hi" : "en")}
            className="shrink-0 px-3 py-1.5 rounded-full border border-teal-200/30 text-sm hover:bg-teal-200/10"
          >
            {lang === "en" ? "हिंदी" : "English"}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="inline-block text-[11px] sm:text-xs px-3 py-1 rounded-full bg-teal-300/10 border border-teal-200/25 mb-5">
          {t.track}
        </div>

        <div ref={boxRef} className="relative max-w-xl">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => hits.length && setOpen(true)}
            onKeyDown={onSearchKeyDown}
            placeholder={t.searchPlaceholder}
            role="combobox"
            aria-expanded={open}
            aria-controls="city-listbox"
            aria-activedescendant={activeIdx >= 0 ? `city-opt-${activeIdx}` : undefined}
            autoComplete="off"
            className="w-full px-4 py-3 rounded-xl bg-teal-950/60 border border-teal-200/25 outline-none focus:border-teal-300/60 placeholder:opacity-40"
          />
          {open && (hits.length > 0 || searching) && (
            <div className="absolute z-10 mt-1 w-full card overflow-hidden">
              <div className="max-h-64 overflow-y-auto search-scroll" role="listbox" id="city-listbox">
                {searching && <div className="px-4 py-3 text-sm opacity-60">{t.searching}</div>}
                {hits.map((h, i) => (
                  <button
                    key={`${h.latitude}-${h.longitude}-${i}`}
                    id={`city-opt-${i}`}
                    role="option"
                    aria-selected={i === activeIdx}
                    onClick={() => pick(h)}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={`w-full text-left px-4 py-2.5 text-sm ${i === activeIdx ? "bg-teal-200/15" : "hover:bg-teal-200/10"}`}
                  >
                    <span className="font-medium">{h.name}</span>
                    <span className="opacity-60"> — {[h.admin1, h.country].filter(Boolean).join(", ")}</span>
                  </button>
                ))}
                {!searching && hits.length === 0 && (
                  <div className="px-4 py-3 text-sm opacity-60">{t.noResults}</div>
                )}
              </div>
            </div>
          )}
        </div>

        {loading && (
          <div className="mt-8 card p-8 text-center">
            <div className="animate-pulse text-teal-200">{t.loading}</div>
          </div>
        )}

        {error && (
          <div className="mt-8 card p-6 text-center border-red-300/30">
            <p className="text-red-200">{t.loadError}</p>
            <p className="mono text-xs opacity-50 mt-2">{error}</p>
          </div>
        )}

        {!loading && !error && !report && (
          <div className="mt-8 card p-10 text-center opacity-70 text-sm">{t.pickCity}</div>
        )}

        {compare.length > 0 && (
          <div className="mt-6 card p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="font-semibold text-sm">{t.compareTitle} ({compare.length}/{MAX_COMPARE})</h3>
              <button
                onClick={() => setShowCompare(!showCompare)}
                className="px-3 py-1 text-xs rounded-lg border border-teal-200/30 hover:bg-teal-200/10"
              >
                {showCompare ? t.hide : t.show}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {compare.map((c, i) => (
                <span key={`${c.place.latitude}-${c.place.longitude}`} className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full bg-teal-300/10 border border-teal-200/25">
                  {c.place.name}
                  <button
                    onClick={() => removeFromCompare(i)}
                    aria-label={`${t.remove} ${c.place.name}`}
                    className="opacity-60 hover:opacity-100 hover:text-red-300"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
            {compareNote && <p className="text-xs opacity-60 mt-2">{compareNote}</p>}
          </div>
        )}

        {showCompare && compare.length > 0 && (
          <CompareView items={compare} t={t} lang={lang} />
        )}

        {report && (
          <ReportView
            r={report}
            t={t}
            lang={lang}
            verdict={verdictText(report)}
            hashCopied={hashCopied}
            linkMsg={linkMsg}
            onCopyHash={onCopyHash}
            onCopyLink={onCopyLink}
            onCompareAdd={() => addToCompare(report)}
            inCompare={compare.some((c) => c.place.latitude === report.place.latitude && c.place.longitude === report.place.longitude)}
          />
        )}
      </main>

      <footer className="max-w-5xl mx-auto px-4 pb-8 text-xs opacity-50">
        {t.dataBy} {new Date(report?.generatedAt ?? Date.now()).toLocaleString()}.
      </footer>
    </div>
  );
}

function CompareView({ items, t, lang }: {
  items: ClimateReport[];
  t: Record<string, string>;
  lang: Lang;
}) {
  return (
    <div className="mt-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((r) => {
          const v = r.verdict;
          const aqiColor = AQI_COLORS[r.air?.band ?? "unknown"] ?? "#94a3b8";
          return (
            <div key={`${r.place.latitude}-${r.place.longitude}`} className="card p-4">
              <h4 className="font-semibold truncate">{r.place.name}</h4>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-4xl font-bold teal-text">
                  {r.current.tempC != null ? `${Math.round(r.current.tempC)}°` : "—"}
                </span>
                <span className="text-xs opacity-60">{r.current.weatherLabel}</span>
              </div>
              <div className="mt-1 text-sm font-medium" style={{ color: aqiColor }}>
                {t.aqi}: {r.air?.usAqi ?? "—"} · {AQI_BAND[lang][r.air?.band ?? "unknown"] ?? r.air?.band}
              </div>
              <div className="mt-3">
                <LineChart
                  labels={r.forecast.map((d) => d.date)}
                  series={[{ label: t.high, values: r.forecast.map((d) => d.tmax), color: "#f87171" }]}
                  height={90}
                  noDataLabel={t.noData}
                  chartLabel={t.tempChartLabel}
                />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-teal-950/50 border border-teal-200/15 px-2 py-1.5">
                  <dt className="opacity-60">{t.avgHigh}</dt>
                  <dd className="font-semibold">{v.avgHighC != null ? `${v.avgHighC}°C` : "—"}</dd>
                </div>
                <div className="rounded-lg bg-teal-950/50 border border-teal-200/15 px-2 py-1.5">
                  <dt className="opacity-60">{t.avgLow}</dt>
                  <dd className="font-semibold">{v.avgLowC != null ? `${v.avgLowC}°C` : "—"}</dd>
                </div>
                <div className="rounded-lg bg-teal-950/50 border border-teal-200/15 px-2 py-1.5">
                  <dt className="opacity-60">{t.rainDays}</dt>
                  <dd className="font-semibold">{v.rainDays}</dd>
                </div>
                <div className="rounded-lg bg-teal-950/50 border border-teal-200/15 px-2 py-1.5">
                  <dt className="opacity-60">{t.trend}</dt>
                  <dd className="font-semibold">
                    {v.trendPer30dC != null ? `${v.trendPer30dC > 0 ? "+" : ""}${v.trendPer30dC}°C${t.per30d}` : "—"}
                  </dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReportView({ r, t, lang, verdict, hashCopied, linkMsg, onCopyHash, onCopyLink, onCompareAdd, inCompare }: {
  r: ClimateReport;
  t: Record<string, string>;
  lang: Lang;
  verdict: string;
  hashCopied: boolean;
  linkMsg: "" | "copied" | "failed";
  onCopyHash: () => void;
  onCopyLink: () => void;
  onCompareAdd: () => void;
  inCompare: boolean;
}) {
  const v = r.verdict;
  const stats: Array<[string, string]> = [
    [t.avgHigh, v.avgHighC != null ? `${v.avgHighC}°C` : "—"],
    [t.avgLow, v.avgLowC != null ? `${v.avgLowC}°C` : "—"],
    [t.rainDays, String(v.rainDays)],
    [t.totalRain, v.totalRainMm != null ? `${v.totalRainMm} mm` : "—"],
    [t.hotDays, String(v.hotDays)],
    [t.trend, v.trendPer30dC != null ? `${v.trendPer30dC > 0 ? "+" : ""}${v.trendPer30dC}°C${t.per30d}` : "—"],
  ];
  const aqiColor = AQI_COLORS[r.air?.band ?? "unknown"] ?? "#94a3b8";

  return (
    <div className="mt-6 space-y-5">
      <div className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold">{r.place.name}</h2>
          <span className="mono text-xs opacity-50">
            {r.place.latitude.toFixed(2)}, {r.place.longitude.toFixed(2)}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-6">
          <div className="text-5xl font-bold teal-text">
            {r.current.tempC != null ? `${Math.round(r.current.tempC)}°` : "—"}
          </div>
          <div className="text-sm space-y-1">
            <div className="font-medium">{r.current.weatherLabel}</div>
            <div className="opacity-70">{t.humidity}: {r.current.humidity != null ? `${r.current.humidity}%` : "—"}</div>
            <div className="opacity-50 text-xs">{t.current}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={onCompareAdd}
            className="px-3 py-1.5 text-xs rounded-lg border border-teal-200/30 hover:bg-teal-200/10"
          >
            {inCompare ? `✓ ${t.compareTitle}` : t.compareAdd}
          </button>
          <button
            onClick={onCopyLink}
            className="px-3 py-1.5 text-xs rounded-lg border border-teal-200/30 hover:bg-teal-200/10"
          >
            {linkMsg === "copied" ? t.linkCopied : t.copyLink}
          </button>
        </div>
        {linkMsg === "failed" && <p className="text-xs text-red-200/80 mt-2">{t.copyFailed}</p>}
      </div>

      <div className="card p-5">
        <h3 className="font-semibold mb-3">{t.forecast7}</h3>
        <LineChart
          labels={r.forecast.map((d) => d.date)}
          series={[
            { label: t.high, values: r.forecast.map((d) => d.tmax), color: "#f87171" },
            { label: t.low, values: r.forecast.map((d) => d.tmin), color: "#5eead4" },
          ]}
          noDataLabel={t.noData}
          chartLabel={t.tempChartLabel}
        />
        <div className="flex gap-4 text-xs mt-1 opacity-70">
          <span><span className="inline-block w-3 h-0.5 bg-red-400 align-middle mr-1" />{t.high}</span>
          <span><span className="inline-block w-3 h-0.5 bg-teal-300 align-middle mr-1" />{t.low}</span>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <div className="card p-5">
          <h3 className="font-semibold mb-3">{t.history30}</h3>
          <LineChart
            labels={r.history.map((d) => d.date)}
            series={[{ label: t.high, values: r.history.map((d) => d.tmax), color: "#fbbf24" }]}
            height={150}
            noDataLabel={t.noData}
            chartLabel={t.tempChartLabel}
          />
        </div>
        <div className="card p-5">
          <h3 className="font-semibold mb-3">{t.airQuality}</h3>
          {r.air && r.air.usAqi != null ? (
            <div>
              <div className="text-4xl font-bold" style={{ color: aqiColor }}>{r.air.usAqi}</div>
              <div className="text-sm mt-1 font-medium" style={{ color: aqiColor }}>
                {AQI_BAND[lang][r.air.band] ?? r.air.band}
              </div>
              <div className="text-xs opacity-60 mt-2">
                {t.aqi} · {t.pm25}: {r.air.pm25 != null ? `${r.air.pm25} µg/m³` : "—"}
              </div>
            </div>
          ) : (
            <div className="text-sm opacity-60">—</div>
          )}
          <div className="grid grid-cols-2 gap-2 mt-4">
            {stats.map(([k, val]) => (
              <div key={k} className="rounded-lg bg-teal-950/50 border border-teal-200/15 px-3 py-2">
                <div className="text-[11px] opacity-60">{k}</div>
                <div className="font-semibold">{val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold mb-2">{t.verdict}</h3>
        <p className="text-sm leading-relaxed opacity-90">{verdict}</p>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold mb-2">{t.verify}</h3>
        <p className="text-xs opacity-60 mb-2">{t.verifyNote}</p>
        <div className="flex items-center gap-2">
          <code className="mono text-[11px] break-all opacity-80 flex-1">{r.verificationHash}</code>
          <button
            onClick={onCopyHash}
            className="shrink-0 px-3 py-1.5 text-xs rounded-lg border border-teal-200/30 hover:bg-teal-200/10"
          >
            {hashCopied ? t.copied : t.copy}
          </button>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold mb-2">{t.sources}</h3>
        <ul className="text-sm space-y-1">
          {r.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer" className="text-teal-300 underline hover:text-teal-100">
                {s.name}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
