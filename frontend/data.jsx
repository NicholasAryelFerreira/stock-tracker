// data.jsx — deterministic mock market data engine.
// Everything is seeded by ticker so prices are stable across reloads but feel real.
// Designed so a real data API can later replace `buildStock()` 1:1.

(function () {
  // ---- seeded RNG ----
  function hashStr(s) { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return h >>> 0; }
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function gauss(rng) { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  // ---- ticker metadata (descriptions intentionally light; the LLM enriches) ----
  const META = {
    GLD:  { name: 'SPDR Gold Shares',          sector: 'Commodity · Gold',        kind: 'ETF',   base: 248,  drift: 0.10, vol: 0.009, mcap: '72.4B',  pe: '—' },
    TSM:  { name: 'Taiwan Semiconductor',      sector: 'Semiconductors',          kind: 'Stock', base: 184,  drift: 0.26, vol: 0.020, mcap: '952B',   pe: '28.4' },
    BOTT: { name: 'Robotics & Automation',     sector: 'Robotics ETF',            kind: 'ETF',   base: 41,   drift: 0.18, vol: 0.022, mcap: '1.3B',   pe: '—' },
    HUMN: { name: 'Humanoid Robotics',         sector: 'Robotics ETF',            kind: 'ETF',   base: 27,   drift: 0.34, vol: 0.031, mcap: '640M',   pe: '—' },
    ISRG: { name: 'Intuitive Surgical',        sector: 'Medical Robotics',        kind: 'Stock', base: 562,  drift: 0.20, vol: 0.018, mcap: '199B',   pe: '76.1' },
    KOID: { name: 'Humanoid Robotics Index',   sector: 'Robotics ETF',            kind: 'ETF',   base: 33,   drift: 0.28, vol: 0.027, mcap: '410M',   pe: '—' },
    NVMI: { name: 'Nova Ltd.',                 sector: 'Semiconductors',          kind: 'Stock', base: 268,  drift: 0.31, vol: 0.026, mcap: '7.8B',   pe: '38.2' },
    TSEM: { name: 'Tower Semiconductor',       sector: 'Semiconductors',          kind: 'Stock', base: 56,   drift: 0.15, vol: 0.024, mcap: '6.2B',   pe: '22.9' },
  };

  function metaFor(tk) {
    if (META[tk]) return META[tk];
    // generic fallback for user-added tickers
    const rng = mulberry32(hashStr(tk));
    return { name: tk + ' Holdings', sector: 'Equity', kind: 'Stock', base: 40 + Math.floor(rng() * 260), drift: 0.05 + rng() * 0.3, vol: 0.015 + rng() * 0.02, mcap: (1 + rng() * 80).toFixed(1) + 'B', pe: (15 + rng() * 40).toFixed(1) };
  }

  // ---- daily OHLC series (~5 trading years) ----
  const TRADING_DAYS = 1260;
  function dailySeries(tk, meta, version) {
    const rng = mulberry32(hashStr(tk + '|daily|v' + version));
    const out = [];
    let price = meta.base / (1 + meta.drift * 0.62); // so it ends near base*~
    const dailyDrift = meta.drift / TRADING_DAYS;
    const now = new Date('2026-06-05T16:00:00');
    // build dates skipping weekends
    const dates = [];
    let d = new Date(now);
    while (dates.length < TRADING_DAYS) { const wd = d.getDay(); if (wd !== 0 && wd !== 6) dates.unshift(new Date(d)); d.setDate(d.getDate() - 1); }
    let regime = 0;
    for (let i = 0; i < TRADING_DAYS; i++) {
      if (rng() < 0.04) regime = (rng() - 0.5) * 2.4; // occasional momentum regime
      regime *= 0.92;
      const o = price;
      const shock = gauss(rng) * meta.vol + dailyDrift + regime * meta.vol * 0.5;
      let c = o * (1 + shock);
      // intraday range
      const range = Math.abs(gauss(rng)) * meta.vol * 0.9 + meta.vol * 0.4;
      const hi = Math.max(o, c) * (1 + range * rng());
      const lo = Math.min(o, c) * (1 - range * rng());
      const vBase = (meta.kind === 'ETF' ? 4 : 9);
      const vol = Math.round((vBase + Math.abs(shock) * 240 + rng() * 5) * (meta.base < 60 ? 3 : 1) * 1e5);
      out.push({ t: dates[i].getTime(), o: +o.toFixed(2), h: +hi.toFixed(2), l: +lo.toFixed(2), c: +c.toFixed(2), v: vol });
      price = c;
    }
    // rescale so the latest close lands near the intended price level, varying slightly per snapshot
    const tRng = mulberry32(hashStr(tk + '|target|v' + version));
    const target = meta.base * (1 + (tRng() - 0.5) * 0.12);
    const factor = target / out[out.length - 1].c;
    return out.map(d => ({ t: d.t, o: +(d.o * factor).toFixed(2), h: +(d.h * factor).toFixed(2), l: +(d.l * factor).toFixed(2), c: +(d.c * factor).toFixed(2), v: d.v }));
  }

  // subdivide one candle into n sub-candles honoring its O/H/L/C via a brownian bridge
  function subdivide(cd, n, seed) {
    const rng = mulberry32(seed);
    const pts = [cd.o];
    for (let i = 1; i < n; i++) { const frac = i / n; const mean = cd.o + (cd.c - cd.o) * frac; pts.push(mean + gauss(rng) * (cd.h - cd.l) * 0.18); }
    pts.push(cd.c);
    // rescale so min->l, max->h
    let mn = Math.min(...pts), mx = Math.max(...pts);
    const scaled = pts.map(p => mx === mn ? p : cd.l + (p - mn) / (mx - mn) * (cd.h - cd.l));
    const bars = [];
    for (let i = 0; i < n; i++) {
      const o = scaled[i], c = scaled[i + 1];
      const h = Math.max(o, c) + Math.abs(gauss(rng)) * (cd.h - cd.l) * 0.06;
      const l = Math.min(o, c) - Math.abs(gauss(rng)) * (cd.h - cd.l) * 0.06;
      bars.push({ t: cd.t - (n - i) * (3600 * 1000), o: +o.toFixed(2), h: +Math.min(h, cd.h).toFixed(2), l: +Math.max(l, cd.l).toFixed(2), c: +c.toFixed(2), v: Math.round(cd.v / n * (0.6 + rng())) });
    }
    return bars;
  }

  function aggregate(daily, size) {
    const out = [];
    for (let i = 0; i < daily.length; i += size) {
      const chunk = daily.slice(i, i + size); if (!chunk.length) continue;
      out.push({ t: chunk[chunk.length - 1].t, o: chunk[0].o, h: Math.max(...chunk.map(x => x.h)), l: Math.min(...chunk.map(x => x.l)), c: chunk[chunk.length - 1].c, v: chunk.reduce((a, x) => a + x.v, 0) });
    }
    return out;
  }
  const weekly = (d) => aggregate(d, 5);
  const monthly = (d) => aggregate(d, 21);

  // ---- news (mock but plausible; clearly demo content) ----
  const SECTOR_NEWS = {
    'Semiconductors': [
      { src: 'Reuters', head: 'Advanced-node capacity sold out through next year as AI demand accelerates', impact: 'pos' },
      { src: 'Bloomberg', head: 'Foundry pricing power firms amid tight leading-edge supply', impact: 'pos' },
      { src: 'WSJ', head: 'Export-control headlines reintroduce volatility across chip names', impact: 'neg' },
      { src: 'Nikkei', head: 'Capex guidance raised on packaging and high-bandwidth memory ramp', impact: 'pos' },
      { src: 'SemiAnalysis', head: 'Inventory normalization continues in analog and mature nodes', impact: 'neu' },
    ],
    'Robotics ETF': [
      { src: 'Reuters', head: 'Humanoid pilots expand into logistics and automotive assembly lines', impact: 'pos' },
      { src: 'Bloomberg', head: 'Component cost curve for actuators steepens commercialization timeline', impact: 'pos' },
      { src: 'TechCrunch', head: 'Funding round values leading humanoid developer at fresh high', impact: 'pos' },
      { src: 'FT', head: 'Analysts caution on valuation as theme outruns near-term revenue', impact: 'neg' },
      { src: 'IEEE Spectrum', head: 'Dexterity benchmarks improve, but unit economics remain unproven', impact: 'neu' },
    ],
    'Medical Robotics': [
      { src: 'Reuters', head: 'Procedure volumes beat expectations on broader surgical adoption', impact: 'pos' },
      { src: 'MedTech Dive', head: 'New platform clearance widens addressable market', impact: 'pos' },
      { src: 'Bloomberg', head: 'Recurring instrument revenue continues to outpace system placements', impact: 'pos' },
      { src: 'WSJ', head: 'Hospital capex caution cited as a swing factor for placements', impact: 'neg' },
    ],
    'Commodity · Gold': [
      { src: 'Reuters', head: 'Bullion firms as real yields ease and central-bank buying persists', impact: 'pos' },
      { src: 'Bloomberg', head: 'Safe-haven flows pick up amid macro uncertainty', impact: 'pos' },
      { src: 'Kitco', head: 'Profit-taking caps rally after run to record territory', impact: 'neg' },
      { src: 'FT', head: 'ETF holdings tick higher for a third straight week', impact: 'pos' },
    ],
    'Equity': [
      { src: 'Reuters', head: 'Shares move on sector rotation and broad-market positioning', impact: 'neu' },
      { src: 'Bloomberg', head: 'Options activity elevated ahead of upcoming catalysts', impact: 'neu' },
      { src: 'WSJ', head: 'Analyst refreshes coverage with a revised price target', impact: 'pos' },
    ],
  };
  const HOURS = ['1h ago', '3h ago', '5h ago', '8h ago', '11h ago', 'Yesterday'];
  function newsFor(tk, meta, version) {
    const pool = SECTOR_NEWS[meta.sector] || SECTOR_NEWS['Equity'];
    const rng = mulberry32(hashStr(tk + '|news|v' + version));
    const idx = pool.map((_, i) => i).sort(() => rng() - 0.5).slice(0, 4);
    return idx.map((i, k) => ({ ...pool[i], time: HOURS[(k + version) % HOURS.length], tk }));
  }

  // ---- risk signals from the data ----
  function riskSignals(daily) {
    const closes = daily.map(d => d.c);
    const last = closes[closes.length - 1], prev = closes[closes.length - 2];
    const dayChg = (last - prev) / prev;
    const hi52 = Math.max(...daily.map(d => d.h)), lo52 = Math.min(...daily.map(d => d.l));
    const rets = []; for (let i = closes.length - 21; i < closes.length; i++) if (i > 0) rets.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const vol20 = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length) * Math.sqrt(252);
    const flags = [];
    if (Math.abs(dayChg) > 0.03) flags.push({ kind: dayChg > 0 ? 'up' : 'down', label: (dayChg > 0 ? 'Sharp gain' : 'Sharp drop') + ' ' + (dayChg * 100).toFixed(1) + '% today' });
    if (last <= lo52 * 1.03) flags.push({ kind: 'down', label: 'Trading near 52-week low' });
    if (last >= hi52 * 0.985) flags.push({ kind: 'up', label: 'At / near 52-week high' });
    if (vol20 > 0.55) flags.push({ kind: 'vol', label: 'Elevated volatility (' + (vol20 * 100).toFixed(0) + '% annualized)' });
    return { flags, dayChg, hi52, lo52, vol20 };
  }

  // ---- assemble a full stock object ----
  function buildStock(tk, version = 0) {
    tk = tk.toUpperCase();
    const meta = metaFor(tk);
    const full = dailySeries(tk, meta, version);   // ~5 years
    const daily = full.slice(-252);                // last year: stats, 52w range, sparkline
    const last = full[full.length - 1];
    const prev = full[full.length - 2];
    const change = last.c - prev.c;
    const changePct = change / prev.c * 100;
    const series = {
      '1D': subdivide(last, 14, hashStr(tk + '1d|v' + version)),
      '1W': daily.slice(-5).flatMap((d, i) => subdivide(d, 7, hashStr(tk + 'w' + i + 'v' + version))),
      '1M': daily.slice(-22),
      '3M': daily.slice(-63),
      '1Y': weekly(daily),
      '5Y': monthly(full),
    };
    const risk = riskSignals(daily);
    return {
      tk, ...meta, daily, series,
      price: last.c, change, changePct,
      open: last.o, high: last.h, low: last.l, prevClose: prev.c,
      hi52: risk.hi52, lo52: risk.lo52, vol20: risk.vol20,
      volume: last.v, avgVol: Math.round(daily.slice(-30).reduce((a, d) => a + d.v, 0) / 30),
      flags: risk.flags,
      news: newsFor(tk, meta, version),
    };
  }

  function fmtNum(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
  }
  function fmtPx(n) { return n >= 1000 ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : n.toFixed(2); }

  window.MarketData = { buildStock, metaFor, fmtNum, fmtPx, DEFAULT_TICKERS: ['GLD', 'TSM', 'BOTT', 'HUMN', 'ISRG', 'KOID', 'NVMI', 'TSEM'] };
})();
