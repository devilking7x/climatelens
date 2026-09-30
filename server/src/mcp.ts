// ClimateLens MCP server (stdio).
// Exposes the climate tools to AI agents (Claude Code, etc.) — no API key needed.
// Run:  pnpm --filter climatelens-server mcp
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  airQuality,
  aqiBand,
  forecast,
  geocode,
  history30,
  weatherLabel,
} from "./openmeteo.js";
import { computeVerdict, reportHash } from "./verdict.js";

const SOURCES = [
  { name: "Open-Meteo Geocoding API", url: "https://open-meteo.com/en/docs/geocoding-api" },
  { name: "Open-Meteo Forecast API", url: "https://open-meteo.com/en/docs" },
  { name: "Open-Meteo Air Quality API", url: "https://open-meteo.com/en/docs/air-quality-api" },
  { name: "Open-Meteo Historical Weather API", url: "https://open-meteo.com/en/docs/historical-weather-api" },
];

const server = new McpServer({ name: "climatelens", version: "0.1.0" });

function errText(e: unknown): string {
  return e instanceof Error ? e.message : "unknown error";
}

server.tool(
  "geocode_place",
  "Search for a place by name and get its coordinates (latitude/longitude). Use the coordinates with climate_report.",
  { q: z.string().min(2).max(80).describe("Place name, e.g. 'Mumbai'") },
  async ({ q }) => {
    try {
      const results = await geocode(q);
      return { content: [{ type: "text", text: JSON.stringify(results) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `geocoding unavailable right now: ${errText(e)}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "climate_report",
  "Full climate report for coordinates: current conditions, 7-day forecast, last 30 observed days, air quality (best-effort), plain-language verdict stats and a tamper-evident SHA-256 report fingerprint. All data is real (Open-Meteo, no key). Never invents numbers — reports honest errors when upstream is down.",
  {
    latitude: z.number().min(-90).max(90).describe("Latitude, -90 to 90"),
    longitude: z.number().min(-180).max(180).describe("Longitude, -180 to 180"),
    name: z.string().max(120).optional().describe("Place name shown in the report"),
  },
  async ({ latitude, longitude, name }) => {
    try {
      const [fc, hist, air] = await Promise.all([
        forecast(latitude, longitude),
        history30(latitude, longitude),
        airQuality(latitude, longitude),
      ]);
      const verdict = computeVerdict(hist);
      const canonical = {
        place: { name: name ?? "", lat: latitude, lon: longitude },
        current: { ...fc.current, weatherLabel: weatherLabel(fc.current.weatherCode) },
        daily: fc.daily,
        history: hist,
        air: air ? { ...air, band: aqiBand(air.usAqi) } : null,
        verdict,
      };
      const payload = {
        ...canonical,
        verificationHash: reportHash(canonical),
        hashNote:
          "SHA-256 fingerprint of this report payload, computed locally for tamper-evidence (not a blockchain transaction).",
        sources: SOURCES,
        generatedAt: new Date().toISOString(),
      };
      return { content: [{ type: "text", text: JSON.stringify(payload) }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `climate data unavailable right now: ${errText(e)}` }],
        isError: true,
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
