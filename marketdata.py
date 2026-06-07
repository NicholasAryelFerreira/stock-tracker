"""Real market data via yfinance (Yahoo Finance).

Builds a stock object whose shape matches what the frontend expects (the same
contract the old client-side mock produced), so the UI consumes it 1:1:

    { tk, name, sector, kind, mcap, pe, daily, series{1D,1W,1M,3M,1Y,5Y},
      price, change, changePct, open, high, low, prevClose,
      hi52, lo52, vol20, volume, flags[], news[] }

Results are cached in-memory with a short TTL so repeated loads don't hammer
Yahoo; the Refresh button passes force=True to bypass the cache.

Note: yfinance is an unofficial Yahoo scraper - great for a demo, but it can
rate-limit or change. Swap this module for a paid market-data API for production.
"""

import math
import time
from datetime import datetime, timezone

import yfinance as yf

TTL_SECONDS = 60
_CACHE = {}  # tk -> (epoch, data)


# --- helpers ---------------------------------------------------------------
def _df_to_bars(df):
    bars = []
    for idx, row in df.iterrows():
        vol = row.get("Volume", 0)
        if vol is None or (isinstance(vol, float) and math.isnan(vol)):
            vol = 0
        try:
            o, h, l, c = float(row["Open"]), float(row["High"]), float(row["Low"]), float(row["Close"])
        except (TypeError, ValueError):
            continue
        if any(math.isnan(x) for x in (o, h, l, c)):
            continue
        bars.append({
            "t": int(idx.timestamp() * 1000),
            "o": round(o, 2), "h": round(h, 2), "l": round(l, 2), "c": round(c, 2),
            "v": int(vol),
        })
    return bars


def _aggregate(bars, size):
    out = []
    for i in range(0, len(bars), size):
        chunk = bars[i:i + size]
        if not chunk:
            continue
        out.append({
            "t": chunk[-1]["t"],
            "o": chunk[0]["o"],
            "h": max(x["h"] for x in chunk),
            "l": min(x["l"] for x in chunk),
            "c": chunk[-1]["c"],
            "v": sum(x["v"] for x in chunk),
        })
    return out


def _risk_signals(daily):
    """Risk flags + 52w range + annualized 20d volatility from daily bars."""
    closes = [d["c"] for d in daily]
    last, prev = closes[-1], closes[-2] if len(closes) > 1 else closes[-1]
    day_chg = (last - prev) / prev if prev else 0.0
    hi52 = max(d["h"] for d in daily)
    lo52 = min(d["l"] for d in daily)
    rets = []
    for i in range(max(1, len(closes) - 21), len(closes)):
        if closes[i - 1]:
            rets.append((closes[i] - closes[i - 1]) / closes[i - 1])
    if rets:
        mean = sum(rets) / len(rets)
        var = sum((r - mean) ** 2 for r in rets) / len(rets)
        vol20 = math.sqrt(var) * math.sqrt(252)
    else:
        vol20 = 0.0
    flags = []
    if abs(day_chg) > 0.03:
        flags.append({"kind": "up" if day_chg > 0 else "down",
                      "label": ("Sharp gain " if day_chg > 0 else "Sharp drop ") + f"{day_chg * 100:.1f}% today"})
    if last <= lo52 * 1.03:
        flags.append({"kind": "down", "label": "Trading near 52-week low"})
    if last >= hi52 * 0.985:
        flags.append({"kind": "up", "label": "At / near 52-week high"})
    if vol20 > 0.55:
        flags.append({"kind": "vol", "label": f"Elevated volatility ({vol20 * 100:.0f}% annualized)"})
    return flags, round(hi52, 2), round(lo52, 2), round(vol20, 4)


def _fmt_cap(n):
    if not n:
        return "—"
    if n >= 1e12:
        return f"{n / 1e12:.2f}T"
    if n >= 1e9:
        return f"{n / 1e9:.2f}B"
    if n >= 1e6:
        return f"{n / 1e6:.0f}M"
    return str(int(n))


def _rel_time(ts):
    """ts: epoch seconds (int) or ISO-8601 string -> 'Xh ago' / 'Yesterday' / 'Mon D'."""
    if ts is None:
        return ""
    if isinstance(ts, str):
        try:
            ts = datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return ""
    delta = time.time() - ts
    if delta < 3600:
        return f"{max(1, int(delta // 60))}m ago"
    if delta < 86400:
        return f"{int(delta // 3600)}h ago"
    if delta < 172800:
        return "Yesterday"
    dt = datetime.fromtimestamp(ts, tz=timezone.utc)
    return f"{dt.strftime('%b')} {dt.day}"


def _build_news(ticker, tk):
    try:
        raw = ticker.news or []
    except Exception:
        raw = []
    items = []
    for it in raw[:8]:
        content = it.get("content") if isinstance(it.get("content"), dict) else None
        if content:
            title = content.get("title")
            prov = (content.get("provider") or {}).get("displayName")
            ts = content.get("pubDate") or content.get("displayTime")
        else:
            title = it.get("title")
            prov = it.get("publisher")
            ts = it.get("providerPublishTime")
        if not title:
            continue
        items.append({"src": prov or "News", "head": title, "time": _rel_time(ts), "tk": tk})
        if len(items) >= 5:
            break
    return items


# --- main ------------------------------------------------------------------
def build_stock(tk, force=False):
    tk = tk.upper().strip()
    now = time.time()
    if not force and tk in _CACHE and now - _CACHE[tk][0] < TTL_SECONDS:
        return _CACHE[tk][1]

    ticker = yf.Ticker(tk)
    hist_d = ticker.history(period="5y", interval="1d", auto_adjust=False).dropna()
    if hist_d.empty:
        raise ValueError(f"No market data for '{tk}'")
    daily_all = _df_to_bars(hist_d)
    if len(daily_all) < 2:
        raise ValueError(f"Insufficient history for '{tk}'")
    last252 = daily_all[-252:]

    try:
        hist_i = ticker.history(period="5d", interval="30m", auto_adjust=False).dropna()
        intra = _df_to_bars(hist_i)
    except Exception:
        intra = []

    try:
        info = ticker.info or {}
    except Exception:
        info = {}

    price = intra[-1]["c"] if intra else daily_all[-1]["c"]
    prev = info.get("previousClose") or (daily_all[-2]["c"] if len(daily_all) > 1 else price)
    change = price - prev
    change_pct = (change / prev * 100) if prev else 0.0

    flags, hi52, lo52, vol20 = _risk_signals(last252)

    series = {
        "1M": last252[-22:],
        "3M": last252[-63:],
        "1Y": _aggregate(last252, 5),
        "5Y": _aggregate(daily_all, 21),
    }
    if intra:
        last_date = datetime.fromtimestamp(intra[-1]["t"] / 1000, tz=timezone.utc).date()
        one_d = [b for b in intra if datetime.fromtimestamp(b["t"] / 1000, tz=timezone.utc).date() == last_date]
        series["1D"] = one_d if one_d else intra[-14:]
        series["1W"] = intra
    else:
        series["1D"] = last252[-1:]
        series["1W"] = last252[-5:]

    quote_type = (info.get("quoteType") or "").upper()
    kind = "ETF" if quote_type in ("ETF", "MUTUALFUND") else "Stock"
    name = info.get("longName") or info.get("shortName") or tk
    sector = info.get("sector") or info.get("category") or ("ETF" if kind == "ETF" else "Equity")
    pe = info.get("trailingPE")
    pe_str = f"{pe:.1f}" if isinstance(pe, (int, float)) and pe > 0 else "—"

    data = {
        "tk": tk,
        "name": name,
        "sector": sector,
        "kind": kind,
        "mcap": _fmt_cap(info.get("marketCap")),
        "pe": pe_str,
        "daily": last252,
        "series": series,
        "price": round(price, 2),
        "change": round(change, 2),
        "changePct": round(change_pct, 2),
        "open": round(float(info.get("open") or daily_all[-1]["o"]), 2),
        "high": round(float(info.get("dayHigh") or daily_all[-1]["h"]), 2),
        "low": round(float(info.get("dayLow") or daily_all[-1]["l"]), 2),
        "prevClose": round(prev, 2),
        "hi52": hi52,
        "lo52": lo52,
        "vol20": vol20,
        "volume": int(info.get("volume") or daily_all[-1]["v"]),
        "flags": flags,
        "news": _build_news(ticker, tk),
    }
    _CACHE[tk] = (now, data)
    return data
