# ClimateLens — AI climate assistant

Ask about any city's climate and get a live report: current conditions, 7-day
forecast, 30 days of observed history with charts, air quality, a plain-language
"climate verdict", and a tamper-evident SHA-256 fingerprint of the report —
all from real data, with cited sources. English/Hindi toggle included.

**Highlights:** multi-city side-by-side comparison (up to 3 cities), shareable
report links (report state is encoded in the URL hash), installable PWA with
offline app shell, an MCP server exposing the climate tools to AI agents
(Claude Code etc.), and one-click Render deploy — all with zero API keys.

Built for the **IEEE ClimateChain Global Hackathon** (AI + Blockchain for a
sustainable tomorrow), track **Climate Data & Environmental Monitoring**
("climate data verification platforms · tools for research and insights").
Official page: https://ieee-climatechain-hack.devpost.com/

> Hackathon note: per the official rules page, submissions open **8 AM PT on
> October 25, 2026**. The closing deadline is not shown on the official page —
> check the Devpost page before submitting.

## How it works

```
city name → Open-Meteo Geocoding → lat/lon
lat/lon   → Open-Meteo Forecast + Air Quality + 30-day Archive (parallel)
          → server computes verdict stats + SHA-256 report hash
          → React UI renders charts, AQI, verdict, hash, citations
```

All climate data comes from **Open-Meteo** (free, no API key):
- Geocoding API — place search
- Forecast API — current + 7-day daily
- Air Quality API — US AQI, PM2.5 (best-effort; report still works without it)
- Historical Weather API — last 30 observed days

**Data honesty:** if an upstream API fails or times out, the server returns
HTTP 502 with "data unavailable" — it never invents numbers. The verification
hash is a locally computed SHA-256 fingerprint for tamper-evidence (track
alignment), not a blockchain transaction.

## Quick start

Requirements: Node 20+, pnpm 9+.

```bash
pnpm install
# terminal 1 — API server (:8788)
pnpm --filter climatelens-server dev
# terminal 2 — web UI (:5173, proxies /api)
pnpm --filter climatelens-web dev
```

Production single-process demo:

```bash
pnpm --filter climatelens-server build
pnpm --filter climatelens-web build
PORT=8788 pnpm --filter climatelens-server start   # serves API + built UI
```

No environment variables needed. No API keys. No sign-ups.

### MCP server (for AI agents)

The climate tools are also exposed as an MCP server over stdio — point
Claude Code (or any MCP client) at it:

```bash
pnpm --filter climatelens-server mcp
```

```jsonc
// .mcp.json (Claude Code)
{ "mcpServers": { "climatelens": { "command": "pnpm", "args": ["--filter", "climatelens-server", "mcp"] } } }
```

Tools: `geocode_place` (place name → coordinates), `climate_report`
(coordinates → full report with verdict + SHA-256 hash).

### Deploy on Render (one click)

`render.yaml` is a Render Blueprint: create a **New → Blueprint** in the
Render dashboard, point it at this repo, and it builds + deploys the single
Node process (API + web UI) on the free tier. Health check: `/api/health`.

## API

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/api/health` | `{ ok, service, time }` |
| GET | `/api/geocode?q=` | Place search (2–80 chars) |
| GET | `/api/climate?lat=&lon=&name=` | Full climate report + verdict + hash |

`verdict` fields: `days`, `avgHighC`, `avgLowC`, `rainDays`, `totalRainMm`,
`hotDays` (≥35°C), `trendPer30dC` (fitted change of daily highs across the
30-day window — deliberately *not* extrapolated to decades).

API hardening: `/api/*` is rate-limited (60 req/min per IP, HTTP 429 beyond
that), unknown API routes return JSON 404s, and basic security headers are set.

## Project layout

```
server/src/
  index.ts      Express app, routes, validation, static UI serving
  middleware.ts rate limiting + security headers
  mcp.ts        MCP server (stdio): geocode_place + climate_report tools
  openmeteo.ts  Open-Meteo clients (12s timeouts, typed)
  verdict.ts    verdict stats + SHA-256 report hash
web/src/
  App.tsx       search, report view, multi-city compare, share links
  api.ts        typed API client
  charts.tsx    dependency-free SVG line charts
  i18n.ts       English/Hindi strings
web/public/icons/  PWA icons (192/512 + maskable)
render.yaml     Render Blueprint (free tier, single process)
```

## Demo script (for the 3–5 min video)

1. Open the app, toggle Hindi → English.
2. Search "Mumbai", pick it from the dropdown (keyboard: ↓/↑ + Enter works).
3. Scroll: current conditions → 7-day forecast chart → 30-day history →
   air quality + stats → verdict → verification hash → sources.
4. Show the hash: copy it, re-fetch, show it matches (same data ⇒ same hash).
5. Click "＋ Compare", add Delhi and Chennai — show the side-by-side view.
6. Click "Copy share link", open it in a new tab — the report loads directly.

## License

MIT — see [LICENSE](LICENSE).
