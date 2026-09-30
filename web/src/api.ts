export interface GeoHit {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

export interface DayPoint {
  date: string;
  tmax: number | null;
  tmin: number | null;
  rainMm: number | null;
}

export interface Verdict {
  days: number;
  avgHighC: number | null;
  avgLowC: number | null;
  rainDays: number;
  totalRainMm: number | null;
  hotDays: number;
  trendPer30dC: number | null;
}

export interface ClimateReport {
  place: { name: string; latitude: number; longitude: number };
  current: {
    time: string;
    tempC: number | null;
    humidity: number | null;
    weatherCode: number | null;
    weatherLabel: string;
  };
  forecast: DayPoint[];
  history: DayPoint[];
  air: { usAqi: number | null; pm25: number | null; band: string } | null;
  verdict: Verdict;
  verificationHash: string;
  hashNote: string;
  sources: { name: string; url: string }[];
  generatedAt: string;
}

async function ok<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error ?? `request failed (${res.status})`);
  }
  return data as T;
}

export async function searchPlaces(q: string): Promise<GeoHit[]> {
  const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
  const data = await ok<{ results: GeoHit[] }>(res);
  return data.results;
}

export async function fetchClimate(
  lat: number,
  lon: number,
  name: string
): Promise<ClimateReport> {
  const res = await fetch(
    `/api/climate?lat=${lat}&lon=${lon}&name=${encodeURIComponent(name)}`
  );
  return ok<ClimateReport>(res);
}
