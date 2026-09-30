// ClimateLens server — real climate data, no API keys.
import "dotenv/config";
import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  airQuality,
  aqiBand,
  forecast,
  geocode,
  history30,
  weatherLabel,
} from "./openmeteo.js";
import { computeVerdict, reportHash } from "./verdict.js";

const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "64kb" }));

const SOURCES = [
  { name: "Open-Meteo Geocoding API", url: "https://open-meteo.com/en/docs/geocoding-api" },
  { name: "Open-Meteo Forecast API", url: "https://open-meteo.com/en/docs" },
  { name: "Open-Meteo Air Quality API", url: "https://open-meteo.com/en/docs/air-quality-api" },
  { name: "Open-Meteo Historical Weather API", url: "https://open-meteo.com/en/docs/historical-weather-api" },
];

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "climatelens", time: new Date().toISOString() });
});

app.get("/api/geocode", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2 || q.length > 80) {
    res.status(400).json({ ok: false, error: "q must be 2-80 characters" });
    return;
  }
  try {
    const results = await geocode(q);
    res.json({ ok: true, results });
  } catch (err) {
    res.status(502).json({ ok: false, error: "geocoding data unavailable right now" });
  }
});

function parseCoord(v: unknown, min: number, max: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

app.get("/api/climate", async (req, res) => {
  const lat = parseCoord(req.query.lat, -90, 90);
  const lon = parseCoord(req.query.lon, -180, 180);
  const name = String(req.query.name ?? "").slice(0, 120);
  if (lat == null || lon == null) {
    res.status(400).json({ ok: false, error: "lat (-90..90) and lon (-180..180) are required" });
    return;
  }
  try {
    const [fc, hist, air] = await Promise.all([
      forecast(lat, lon),
      history30(lat, lon),
      airQuality(lat, lon),
    ]);
    const verdict = computeVerdict(hist);
    const canonical = {
      place: { name, lat, lon },
      current: fc.current,
      daily: fc.daily,
      history: hist,
      air,
      verdict,
    };
    const hash = reportHash(canonical);
    res.json({
      ok: true,
      place: { name, latitude: lat, longitude: lon },
      current: { ...fc.current, weatherLabel: weatherLabel(fc.current.weatherCode) },
      forecast: fc.daily,
      history: hist,
      air: air ? { ...air, band: aqiBand(air.usAqi) } : null,
      verdict,
      verificationHash: hash,
      hashNote:
        "SHA-256 fingerprint of this report payload (computed locally for tamper-evidence).",
      sources: SOURCES,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    // Never invent data: if upstream fails, say so honestly.
    res.status(502).json({ ok: false, error: "climate data unavailable right now — please retry" });
  }
});

// Serve the built web UI when present (single-process demo mode).
const here = dirname(fileURLToPath(import.meta.url));
const webDist = join(here, "..", "..", "web", "dist");
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("*", (_req, res) => res.sendFile(join(webDist, "index.html")));
}

const port = Number(process.env.PORT ?? 8788);
app.listen(port, () => {
  console.log(`climatelens server on :${port}`);
});
