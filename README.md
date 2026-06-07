# Stock Tracker

A modern-fintech watchlist dashboard for tracking and monitoring specific stocks,
with AI-generated insights (per-stock research read, news summary, and a
whole-watchlist Daily Digest). Built from a Claude Design handoff.

Default watchlist: `GLD, TSM, BOTT, HUMN, ISRG, KOID, NVMI, TSEM` — add/remove any
ticker; your watchlist, selection, and alerts persist in `localStorage`.

## Running

It's a static, no-build app (React + Babel Standalone loaded from a CDN). Serve the
folder over HTTP so the `.jsx` files load:

```sh
# any static server works; e.g.
npx serve .
# or
python -m http.server 8000
```

Then open `index.html` via the server (opening it as a `file://` URL won't load the
scripts in most browsers).

## Layout

- **Topbar** — brand → search → market status + clock → Refresh / Add / Daily Digest.
- **Watchlist rail** (left) — each row shows ticker, name, sparkline, price, and
  daily change pill. Click to open the detail view.
- **Detail** (right) — header with price/change and risk-flag chip, a canvas
  candlestick chart (`1D/1W/1M/3M/1Y/5Y` + crosshair tooltip), a 6-stat strip, and
  panels for **AI Insight**, **Recent News**, **Risk Monitor**, and **Price Alerts**
  (above/below, `$` or `%`).
- **Daily Digest** slide-over — synthesizes the whole watchlist into a morning brief.
- **Tweaks** panel — accent color, density, chart height, sparkline toggle.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Entry point — fonts, CDN scripts, density rules. |
| `styles.css` | Design system + all component styles. |
| `data.jsx` | Deterministic mock market-data engine (OHLC series, news, risk signals). |
| `chart.jsx` | Canvas candlestick chart + watchlist sparkline. |
| `ai.jsx` | LLM calls (insight / news summary / digest) with local fallbacks + seed data. |
| `tweaks-panel.jsx` | Reusable Tweaks panel + form controls. |
| `app.jsx` | Main app — shell, watchlist, detail, AI panels, digest, modals. |

## Data & AI — wiring real APIs later

- **Market data is deterministic mock data**, seeded per ticker, designed so a real
  market-data API drops into `buildStock()` in `data.jsx` 1:1.
- **AI** uses `window.claude.complete` when available (the Claude Design host, or a
  backend you wire up later). When it's absent, `ai.jsx` falls back to a deterministic
  local synthesis derived from the same price/news data, so every AI surface still
  produces sensible output offline. On first load, pre-written seed insights/summaries
  render with zero API cost; hitting **Refresh** regenerates the open stock live.

> Labels make clear this is demo data and "not investment advice."
