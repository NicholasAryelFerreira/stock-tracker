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

```powershell
.\run.ps1
```

`run.ps1` is idempotent: on first run it creates the venv, installs deps, and
copies `.env.example` to `.env` (edit it to add your key); on every run it just
starts the server at <http://localhost:8000>. The steps below are the manual
equivalent / for non-Windows.

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

> **Frontend-only dev:** `python -m http.server 8753 --directory frontend` serves
> just the UI. With no backend reachable, the AI calls fail gracefully and the app
> renders deterministic local fallbacks — handy for pure layout work.

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
| `main.py` | FastAPI backend — `/api/complete`, `/api/health`, static serving. |
| `requirements.txt` | Backend Python dependencies. |
| `.env.example` | Template for `OPENAI_API_KEY` and model config (copy to `.env`). |
| `frontend/index.html` | Entry point — fonts, CDN scripts, density rules. |
| `frontend/styles.css` | Design system + all component styles. |
| `frontend/data.jsx` | Deterministic mock market-data engine (OHLC, news, risk). |
| `frontend/chart.jsx` | Canvas candlestick chart + watchlist sparkline. |
| `frontend/ai.jsx` | AI calls (insight / news summary / digest), transport + local fallbacks. |
| `frontend/tweaks-panel.jsx` | Reusable Tweaks panel + form controls. |
| `frontend/app.jsx` | Main app — shell, watchlist, detail, AI panels, digest, modals. |

## AI & data

**Transport (`frontend/ai.jsx`).** Each AI call tries, in order: the design host's
`window.claude.complete` → our `POST /api/complete` → a deterministic local
fallback. So the UI always produces sensible output, even with no key or backend.
On first load, pre-written seed insights/summaries render at zero API cost; hitting
**Refresh** regenerates the open stock live.

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

**Market data is deterministic mock data**, seeded per ticker, designed so a real
market-data quote API drops into `buildStock()` in `frontend/data.jsx` 1:1. Labels
make clear this is demo data and "not investment advice."

### Next steps to go fully live

- Wire a real market-data API into `buildStock()` (quotes, OHLC).
- Add a dedicated endpoint that returns *real* searched headlines so the news
  **list** (not just the summary) is live; surface the `url_citation` sources as
  clickable links.
- Add response caching / rate-limiting on the backend to control cost.
