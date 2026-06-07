# Stock Tracker

A modern-fintech watchlist dashboard for tracking and monitoring specific stocks,
with AI-generated insights (per-stock research read, news summary, and a
whole-watchlist Daily Digest). Built from a Claude Design handoff.

Default watchlist: `GLD, TSM, BOTT, HUMN, ISRG, KOID, NVMI, TSEM` — add/remove any
ticker; your watchlist, selection, and alerts persist in `localStorage`.

## Architecture

- **`frontend/`** — static, no-build app (React + Babel Standalone from a CDN).
- **`main.py`** — FastAPI backend-for-frontend. Holds the OpenAI key server-side,
  proxies AI calls (`POST /api/complete`), and serves the `frontend/` directory.

The browser never sees the API key — it only ever calls `/api/complete` on our own
backend. Only `frontend/` is served statically, so `.env` and `main.py` are not
reachable over HTTP.

## Running

### Quick start (Windows)

```cmd
REM Command Prompt:
run.bat
```
```powershell
# PowerShell:
.\run.ps1
```

Both are idempotent: on first run they create the venv, install deps, and copy
`.env.example` to `.env` (edit it to add your key); on every run they just start
the server at <http://localhost:8000>. Stop with `Ctrl+C`.

> `.\run.ps1` only works in **PowerShell** — in Command Prompt use `run.bat`
> instead (cmd can't execute `.ps1` files). The steps below are the manual
> equivalent / for non-Windows.

### 1. Install backend deps

```sh
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure the key

```sh
cp .env.example .env   # then edit .env and paste your OPENAI_API_KEY
```

### 3. Run

```sh
uvicorn main:app --reload --port 8000
```

Open <http://localhost:8000>. The backend serves the frontend and the AI endpoints
from one origin.

> **Note:** market data now comes from the backend, so run via `uvicorn` (above).
> A static-only server (`python -m http.server --directory frontend`) will load the
> UI but show a "couldn't reach the market-data service" state, since `/api/*` isn't
> available — fine for pure CSS/layout tweaks only.

## Layout

- **Topbar** — brand → search → market status + clock → Refresh / Daily Digest.
- **Watchlist rail** (left) — each row shows ticker, name, sparkline, price, and
  daily change pill. Click to open the detail view.
- **Detail** (right) — header with price/change and risk-flag chip, a canvas
  candlestick chart (`1D/1W/1M/3M/1Y/5Y` + crosshair tooltip), a 6-stat strip, and
  stacked panels for **AI Insight**, **Recent News**, **Risk Monitor**, and
  **Price Alerts** (above/below, `$` or `%`).
- **Daily Digest** slide-over — synthesizes the whole watchlist into a morning brief.
- **Tweaks** panel — accent color, density, chart height, sparkline toggle.

## Files

| File | Purpose |
|------|---------|
| `main.py` | FastAPI backend — `/api/stocks`, `/api/complete`, `/api/health`, static serving. |
| `marketdata.py` | Real market data via yfinance (quotes, OHLC, stats, risk flags, news). |
| `requirements.txt` | Backend Python dependencies. |
| `.env.example` | Template for `OPENAI_API_KEY` and model config (copy to `.env`). |
| `frontend/index.html` | Entry point — fonts, CDN scripts, density rules. |
| `frontend/styles.css` | Design system + all component styles. |
| `frontend/data.jsx` | Market-data client — fetches `/api/stocks` + number formatting. |
| `frontend/chart.jsx` | Canvas candlestick chart + watchlist sparkline. |
| `frontend/ai.jsx` | AI calls (insight / news summary / digest), transport + local fallbacks. |
| `frontend/tweaks-panel.jsx` | Reusable Tweaks panel + form controls. |
| `frontend/app.jsx` | Main app — shell, watchlist, detail, AI panels, digest, modals. |

## AI & data

**Market data (`marketdata.py` → `/api/stocks`).** Real quotes, OHLC history (all
timeframes), stats (52w range, market cap, P/E, volume), risk flags, and headlines
come from **yfinance** (Yahoo Finance). Results are cached in-memory for 60s;
**Refresh** passes `fresh=1` to bypass the cache and pull the latest. There is no
mock data — fields Yahoo doesn't provide (e.g. an ETF's P/E) render as "—".

> yfinance is an unofficial Yahoo scraper — ideal for a demo, but it can rate-limit
> or change. Swap `marketdata.py` for a paid market-data API for production.

**AI transport (`frontend/ai.jsx`).** Each AI call tries, in order: the design host's
`window.claude.complete` → our `POST /api/complete` → a deterministic local fallback
(derived from the real price/news data). The AI Insight and news summary are **empty
until generated** — click **Generate insight** (or **Refresh**) to produce a live read;
nothing is pre-canned.

**OpenAI (`main.py`).** Calls go through the **Responses API**. The news summary
sets `web_search: true`, which uses the hosted `web_search` tool with a
reasoning-capable model; AI Insight and the Daily Digest use the text model. Models
are env-configurable:

| Env var | Default | Used for |
|---------|---------|----------|
| `OPENAI_MODEL` | `gpt-5.4-nano-2026-03-17` | AI Insight, Daily Digest |
| `OPENAI_WEB_SEARCH_MODEL` | `gpt-5.5` | News summary (web search) |
| `OPENAI_SEARCH_CONTEXT_SIZE` | `low` | Web search depth |

> Confirm the exact model IDs against OpenAI's current model list — and that your
> chosen model supports the `web_search` tool — before relying on them.

AI output is labeled "Generated by AI · not investment advice."

### Possible next steps

- Add clickable source links to the news list (yfinance provides article URLs).
- Swap yfinance for a paid market-data API (e.g. Polygon, Twelve Data) for
  production reliability and rate limits.
- Add backend rate-limiting / a longer cache for AI responses to control cost.
