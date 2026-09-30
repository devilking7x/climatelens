// Open-Meteo clients — all endpoints are free and need no API key.
// https://open-meteo.com/en/docs

const UA = "ClimateLens/0.1.0 (IEEE ClimateChain hackathon prototype)";
const TIMEOUT_MS = 12000;

async function getJSON(url: string): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`open-meteo responded ${res.status}`);
  return res.json();
}

export interface GeoHit {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

export async function geocode(q: string): Promise<GeoHit[]> {
  const url =
    "https://geocoding-api.open-meteo.com/v1/search?name=" +
    encodeURIComponent(q) +
    "&count=6&language=en&format=json";
  const data = (await getJSON(url)) as { results?: Array<Record<string, unknown>> };
  return (data.results ?? []).map((r) => ({
    name: String(r.name ?? ""),
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    country: r.country ? String(r.country) : undefined,
    admin1: r.admin1 ? String(r.admin1) : undefined,
  }));
}

export interface DayPoint {
  date: string;
  tmax: number | null;
  tmin: number | null;
  rainMm: number | null;
}

interface DailyBlock {
  time?: string[];
  temperature_2m_max?: Array<number | null>;
  temperature_2m_min?: Array<number | null>;
  precipitation_sum?: Array<number | null>;
}

function toDays(d: DailyBlock): DayPoint[] {
  const n = d.time?.length ?? 0;
  const out: DayPoint[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      date: d.time![i],
      tmax: d.temperature_2m_max?.[i] ?? null,
      tmin: d.temperature_2m_min?.[i] ?? null,
      rainMm: d.precipitation_sum?.[i] ?? null,
    });
  }
  return out;
}

export interface CurrentNow {
  time: string;
  tempC: number | null;
  humidity: number | null;
  weatherCode: number | null;
}

export async function forecast(
  lat: number,
  lon: number
): Promise<{ current: CurrentNow; daily: DayPoint[] }> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum` +
    `&timezone=auto&forecast_days=7`;
  const data = (await getJSON(url)) as {
    current?: Record<string, unknown>;
    daily?: DailyBlock;
  };
  const c = data.current ?? {};
  return {
    current: {
      time: String(c.time ?? ""),
      tempC: typeof c.temperature_2m === "number" ? c.temperature_2m : null,
      humidity: typeof c.relative_humidity_2m === "number" ? c.relative_humidity_2m : null,
      weatherCode: typeof c.weather_code === "number" ? c.weather_code : null,
    },
    daily: toDays(data.daily ?? {}),
  };
}

export interface AirNow {
  usAqi: number | null;
  pm25: number | null;
}

export async function airQuality(lat: number, lon: number): Promise<AirNow | null> {
  try {
    const url =
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&current=us_aqi,pm2_5&timezone=auto`;
    const data = (await getJSON(url)) as { current?: Record<string, unknown> };
    const c = data.current ?? {};
    return {
      usAqi: typeof c.us_aqi === "number" ? c.us_aqi : null,
      pm25: typeof c.pm2_5 === "number" ? c.pm2_5 : null,
    };
  } catch {
    return null; // air quality is best-effort; never fail the whole report
  }
}

/** Last 30 complete days of observed data (archive lags a few days). */
export async function history30(lat: number, lon: number): Promise<DayPoint[]> {
  const end = new Date(Date.now() - 6 * 86400_000);
  const start = new Date(Date.now() - 36 * 86400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${iso(start)}&end_date=${iso(end)}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;
  const data = (await getJSON(url)) as { daily?: DailyBlock };
  return toDays(data.daily ?? {});
}

// WMO weather-code -> short label
const WMO: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain", 71: "Light snow", 73: "Snow",
  75: "Heavy snow", 80: "Light showers", 81: "Showers", 82: "Violent showers",
  95: "Thunderstorm", 96: "Storm + hail", 99: "Storm + heavy hail",
};

export function weatherLabel(code: number | null): string {
  if (code == null) return "Unknown";
  return WMO[code] ?? "Unknown";
}

export function aqiBand(aqi: number | null): string {
  if (aqi == null) return "unknown";
  if (aqi <= 50) return "good";
  if (aqi <= 100) return "moderate";
  if (aqi <= 150) return "unhealthy-sensitive";
  if (aqi <= 200) return "unhealthy";
  if (aqi <= 300) return "very-unhealthy";
  return "hazardous";
}
