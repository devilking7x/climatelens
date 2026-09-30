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

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function App() {
  const [lang, setLang] = useState<Lang>("en");
  const t = STR[lang];
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 350);
  const [hits, setHits] = useState<GeoHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<ClimateReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.lang = lang === "hi" ? "hi" : "en";
    document.title = lang === "hi" ? "ClimateLens — AI jalvayu sahayak" : "ClimateLens — AI climate assistant";
  }, [lang]);

  useEffect(() => {
    if (dq.trim().length < 2) { setHits([]); return; }
    setSearching(true);
    searchPlaces(dq.trim())
      .then((r) => { setHits(r); setOpen(true); })
      .catch(() => setHits([]))
      .finally(() => setSearching(false));
  }, [dq]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  async function pick(h: GeoHit) {
    setOpen(false);
    setQ(h.name);
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const r = await fetchClimate(h.latitude, h.longitude, h.name);
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.loadError);
    } finally {
      setLoading(false);
    }
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
            placeholder={t.searchPlaceholder}
            className="w-full px-4 py-3 rounded-xl bg-teal-950/60 border border-teal-200/25 outline-none focus:border-teal-300/60 placeholder:opacity-40"
          />
          {open && (hits.length > 0 || searching) && (
            <div className="absolute z-10 mt-1 w-full card overflow-hidden">
              <div className="max-h-64 overflow-y-auto search-scroll">
                {searching && <div className="px-4 py-3 text-sm opacity-60">{t.searching}</div>}
                {hits.map((h, i) => (
                  <button
                    key={`${h.latitude}-${h.longitude}-${i}`}
                    onClick={() => pick(h)}
                    className="w-full text-left px-4 py-2.5 hover:bg-teal-200/10 text-sm"
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

        {report && <ReportView r={report} t={t} lang={lang} verdict={verdictText(report)} copied={copied} setCopied={setCopied} />}
      </main>

      <footer className="max-w-5xl mx-auto px-4 pb-8 text-xs opacity-50">
        {t.dataBy} {new Date(report?.generatedAt ?? Date.now()).toLocaleString()}.
      </footer>
    </div>
  );
}

function ReportView({ r, t, lang, verdict, copied, setCopied }: {
  r: ClimateReport;
  t: Record<string, string>;
  lang: Lang;
  verdict: string;
  copied: boolean;
  setCopied: (b: boolean) => void;
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
      </div>

      <div className="card p-5">
        <h3 className="font-semibold mb-3">{t.forecast7}</h3>
        <LineChart
          labels={r.forecast.map((d) => d.date)}
          series={[
            { label: t.high, values: r.forecast.map((d) => d.tmax), color: "#f87171" },
            { label: t.low, values: r.forecast.map((d) => d.tmin), color: "#5eead4" },
          ]}
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
            onClick={() => {
              navigator.clipboard.writeText(r.verificationHash).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="shrink-0 px-3 py-1.5 text-xs rounded-lg border border-teal-200/30 hover:bg-teal-200/10"
          >
            {copied ? t.copied : t.copy}
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
