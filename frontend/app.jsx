// app.jsx — Lumen stock tracker. Master/detail dashboard with live LLM features.
const { useState, useEffect, useMemo, useRef, useCallback } = React;
const MD = window.MarketData;

/* brand logo — ascending candlesticks in the accent color (recolors with tweaks) */
function LogoMark({ size = 32 }) {
  return (
    <div className="brand-mark" style={{ width: size, height: size, borderRadius: size * 0.29 }}>
      <svg viewBox="0 0 32 32" width={size} height={size} fill="none" stroke="#fff" strokeLinecap="round">
        <g strokeWidth="1.3" opacity=".95">
          <line x1="10" y1="20" x2="10" y2="9.5" /><line x1="16" y1="23" x2="16" y2="13" /><line x1="22" y1="16" x2="22" y2="6" />
        </g>
        <g fill="#fff" stroke="none">
          <rect x="8" y="13" width="4" height="6" rx="1.1" /><rect x="14" y="16" width="4" height="5" rx="1.1" /><rect x="20" y="8" width="4" height="6.5" rx="1.1" />
        </g>
      </svg>
    </div>
  );
}

/* ---------------- icons (simple line glyphs) ---------------- */
const I = {
  search: <path d="M11 11 14.5 14.5M12.5 7.5a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z" />,
  plus: <path d="M8 3v10M3 8h10" />,
  sparkle: <path d="M8 2.5 9.2 6 12.8 7.2 9.2 8.4 8 12 6.8 8.4 3.2 7.2 6.8 6 8 2.5Z" />,
  bell: <path d="M5 7a3 3 0 0 1 6 0c0 3 1.2 4 1.2 4H3.8S5 10 5 7ZM6.6 13a1.5 1.5 0 0 0 2.8 0" />,
  x: <path d="M4 4l8 8M12 4l-8 8" />,
  trendUp: <path d="M2 11 6.5 6.5 9 9 14 4M14 4h-3.2M14 4v3.2" />,
  trendDown: <path d="M2 5 6.5 9.5 9 7 14 12M14 12h-3.2M14 12V8.8" />,
  alert: <path d="M8 2.5 14.5 13.5H1.5L8 2.5ZM8 6.5v3.2M8 11.6v.1" />,
  refresh: <path d="M13 8a5 5 0 1 1-1.5-3.6M13 3v2.2h-2.2" />,
  digest: <path d="M3 3.5h10M3 7h10M3 10.5h6.5" />,
  arrow: <path d="M5 3l5 5-5 5" />,
  bolt: <path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8l1-5.5Z" />,
  trash: <path d="M3 4.5h10M6 4.5V3h4v1.5M5 4.5l.6 9h4.8l.6-9" />,
  clock: <path d="M8 4.2V8l2.4 1.6M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0Z" />,
};
function Ico({ d, size = 16, sw = 1.6, fill, ...p }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill={fill || 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...p}>{d}</svg>;
}

/* ---------------- persistence ---------------- */
const LS = {
  get(k, def) { try { const v = localStorage.getItem('lumen.' + k); return v ? JSON.parse(v) : def; } catch (_) { return def; } },
  set(k, v) { try { localStorage.setItem('lumen.' + k, JSON.stringify(v)); } catch (_) {} },
};

/* ---------------- accent palettes for tweaks ---------------- */
const ACCENTS = {
  Gold:   { a: '#e8b923', soft: '#faf0c8', ink: '#7a5e00' },
  Azure:  { a: '#2a6fdb', soft: '#e2ecfb', ink: '#1a4c9e' },
  Emerald:{ a: '#1f8a5b', soft: '#e0f1e8', ink: '#14613f' },
  Violet: { a: '#7a5ae0', soft: '#ece6fb', ink: '#503a9e' },
};

/* ---------------- alerts ----------------
 * price mode: trigger when current price crosses the value.
 * pct mode:   trigger on TODAY's % change crossing the value (value may be negative). */
function alertHit(stock, a) {
  if (!stock) return false;
  const mode = a.mode || 'price';
  if (mode === 'pct') return a.type === 'above' ? stock.changePct >= a.value : stock.changePct <= a.value;
  return a.type === 'above' ? stock.price >= a.value : stock.price <= a.value;
}

/* ===================================================================== */
function App() {
  const [tickers, setTickers] = useState(() => LS.get('tickers', MD.DEFAULT_TICKERS));
  const [selected, setSelected] = useState(() => LS.get('selected', tickers[0]));
  const [tf, setTf] = useState('3M');
  const [addOpen, setAddOpen] = useState(false);
  const [digestOpen, setDigestOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(new Date());
  const [alerts, setAlerts] = useState(() => LS.get('alerts', {}));   // { TK: [ {id,type,mode,value} ] }
  const [alertsDismissed, setAlertsDismissed] = useState(false);
  useEffect(() => { LS.set('alerts', alerts); }, [alerts]);
  const setTickerAlerts = (tk, list) => setAlerts(p => ({ ...p, [tk]: list }));

  // tweaks
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{ "accent": "Gold", "density": "regular", "sparklines": true, "chartHeight": 300 }/*EDITMODE-END*/;
  const [tw, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  useEffect(() => { LS.set('tickers', tickers); }, [tickers]);
  useEffect(() => { LS.set('selected', selected); }, [selected]);

  // apply accent
  useEffect(() => {
    const c = ACCENTS[tw.accent] || ACCENTS.Gold;
    const r = document.documentElement.style;
    r.setProperty('--accent', c.a); r.setProperty('--accent-soft', c.soft); r.setProperty('--accent-ink', c.ink);
  }, [tw.accent]);

  // refresh counter — also the AI-cache namespace; bumping it triggers a fresh data fetch
  const [version, setVersion] = useState(() => LS.get('version', 0));
  const [aiCache, setAiCache] = useState(() => LS.get('aiCache', {}));     // { "TK#ver": insight }
  const [newsCache, setNewsCache] = useState(() => LS.get('newsCache', {})); // { "TK#ver": summary }
  const [refreshing, setRefreshing] = useState(false);   // data refresh — drives the top-bar spinner
  const [aiBusy, setAiBusy] = useState(false);           // background AI generation — drives the Insight card shimmer
  const [lastRefresh, setLastRefresh] = useState(() => LS.get('lastRefresh', null));
  const [digestCache, setDigestCache] = useState({}); // { ver: digestData }
  useEffect(() => { LS.set('version', version); }, [version]);
  useEffect(() => { LS.set('aiCache', aiCache); }, [aiCache]);
  useEffect(() => { LS.set('newsCache', newsCache); }, [newsCache]);
  useEffect(() => { LS.set('lastRefresh', lastRefresh); }, [lastRefresh]);

  // real market data, fetched from the backend (yfinance) — no mock data
  const [stocks, setStocks] = useState({});        // { TK: stock }
  const [dataErrors, setDataErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(null);

  const loadData = useCallback(async (fresh) => {
    setLoading(true); setLoadErr(null);
    try {
      const res = await MD.fetchStocks(tickers, { fresh });
      setStocks(prev => ({ ...prev, ...(res.stocks || {}) }));
      setDataErrors(res.errors || {});
      return res.stocks || {};
    } catch (e) {
      setLoadErr(e.message || 'Failed to load');
      return null;
    } finally {
      setLoading(false);
    }
  }, [tickers]);

  // load on mount and whenever the watchlist changes
  useEffect(() => { loadData(false); }, [loadData]);

  const stockList = tickers.map(tk => stocks[tk]).filter(Boolean);
  const sel = stocks[selected] || stockList[0];

  // AI content: live cache for this snapshot only — no canned/fake data, empty until generated
  const vKey = (tk) => tk + '#' + version;
  const resolveInsight = (tk) => aiCache[vKey(tk)] || null;
  const resolveNews = (tk) => newsCache[vKey(tk)];

  const regenInsight = useCallback(async (tk) => {
    const s = stocks[tk]; if (!s) return null;
    const r = await window.AI.insight(s);
    setAiCache(p => ({ ...p, [tk + '#' + version]: r })); return r;
  }, [stocks, version]);

  // Refresh: refetch live market data (top-bar spinner), then generate a fresh AI read for
  // the open stock in the background (its own card shimmer). Decoupled so the top-bar spinner
  // stops as soon as data is in — it doesn't wait on the slower AI/web-search call.
  // Linear with try/finally so neither flag can get stuck (success, error, or timeout).
  async function refreshAll() {
    if (refreshing) return;
    setRefreshing(true);
    const v = version + 1;
    let fresh = null;
    try {
      fresh = await loadData(true);                        // real, cache-bypassing data
      setVersion(v);                                        // new AI-cache namespace
      setLastRefresh(Date.now());
    } catch (e) { /* keep prior data on failure */ }
    finally { setRefreshing(false); }                       // spinner stops once data is in

    const s = fresh && (fresh[selected] || fresh[Object.keys(fresh)[0]]);
    if (!s) return;
    setAiBusy(true);
    try {
      const [ins, sum] = await Promise.all([window.AI.insight(s), window.AI.summarizeNews(s)]);
      setAiCache(p => ({ ...p, [s.tk + '#' + v]: ins }));
      setNewsCache(p => ({ ...p, [s.tk + '#' + v]: sum }));
    } catch (e) { /* keep prior AI */ }
    finally { setAiBusy(false); }
  }

  function addTicker(tk) {
    tk = tk.toUpperCase().trim();
    if (!tk || tickers.includes(tk)) { setSelected(tk); setAddOpen(false); return; }
    setTickers([...tickers, tk]); setSelected(tk); setAddOpen(false);
  }
  function removeTicker(tk) {
    const next = tickers.filter(t => t !== tk);
    setTickers(next);
    if (selected === tk) setSelected(next[0] || null);
  }
  function retryLoad() { loadData(true); }

  // drag-and-drop reorder of the watchlist: move `fromTk` to `toTk`'s position
  function reorderTickers(fromTk, toTk) {
    setTickers(prev => {
      const arr = prev.slice();
      const fi = arr.indexOf(fromTk);
      if (fi < 0) return prev;
      arr.splice(fi, 1);
      const ti = arr.indexOf(toTk);
      arr.splice(ti < 0 ? arr.length : ti, 0, fromTk);
      return arr;
    });
  }

  // triggered alerts across the whole watchlist (for the top banner)
  const triggered = [];
  tickers.forEach(tk => (alerts[tk] || []).forEach(a => { if (alertHit(stocks[tk], a)) triggered.push({ tk, stock: stocks[tk], a }); }));
  // re-surface the banner after each refresh (new data may trigger new alerts)
  useEffect(() => { setAlertsDismissed(false); }, [version]);

  const filtered = stockList.filter(s => !query || s.tk.includes(query.toUpperCase()) || s.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="app" data-density={tw.density}>
      <Topbar now={now} onDigest={() => setDigestOpen(true)} query={query} setQuery={setQuery} onRefresh={refreshAll} refreshing={refreshing} lastRefresh={lastRefresh} />
      {triggered.length > 0 && !alertsDismissed && (
        <AlertsBanner triggered={triggered} onSelect={(tk) => setSelected(tk)} onDismiss={() => setAlertsDismissed(true)} />
      )}
      <div className="body">
        <Rail stocks={filtered} all={stockList} selected={selected} onSelect={setSelected} onAdd={() => setAddOpen(true)} sparklines={tw.sparklines} loading={loading}
          onReorder={reorderTickers} reorderable={!query} />
        {sel ? (
          <Detail key={sel.tk + '#' + version} stock={sel} tf={tf} setTf={setTf} chartHeight={tw.chartHeight}
            insight={resolveInsight(sel.tk)} onGenerate={() => regenInsight(sel.tk)}
            newsSum={resolveNews(sel.tk)} aiBusy={aiBusy}
            alerts={alerts[sel.tk] || []} onAlertsChange={(list) => setTickerAlerts(sel.tk, list)}
            onRemove={() => removeTicker(sel.tk)} />
        ) : loading ? (
          <div className="detail"><div className="empty-state"><div><span className="pulse-dot" style={{ margin: '0 auto 14px' }} /><p>Loading live market data…</p></div></div></div>
        ) : loadErr ? (
          <div className="detail"><div className="empty-state"><div><p>Couldn't reach the market-data service.</p><p style={{ fontSize: 12, marginTop: 6 }}>{loadErr}</p><button className="btn btn-accent btn-sm" onClick={retryLoad} style={{ marginTop: 14 }}>Retry</button></div></div></div>
        ) : (
          <div className="detail"><div className="empty-state"><div><p>{tickers.length ? 'No data available for your watchlist.' : 'No stocks in your watchlist.'}</p><button className="btn btn-accent btn-sm" onClick={() => setAddOpen(true)} style={{ marginTop: 12 }}>Add a stock</button></div></div></div>
        )}
      </div>

      {addOpen && <AddModal onClose={() => setAddOpen(false)} onAdd={addTicker} existing={tickers} />}
      {digestOpen && <Digest stocks={stockList} onClose={() => setDigestOpen(false)} onSelect={(tk) => { setSelected(tk); setDigestOpen(false); }} now={now} cached={digestCache[version]} onResult={(d) => setDigestCache(p => ({ ...p, [version]: d }))} />}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Appearance" />
        <TweakColor label="Accent" value={ACCENTS[tw.accent].a}
          options={Object.values(ACCENTS).map(c => c.a)}
          onChange={(v) => setTweak('accent', Object.keys(ACCENTS).find(k => ACCENTS[k].a === v) || 'Gold')} />
        <TweakRadio label="Density" value={tw.density} options={['compact', 'regular']} onChange={(v) => setTweak('density', v)} />
        <TweakSection label="Chart" />
        <TweakSlider label="Chart height" value={tw.chartHeight} min={220} max={400} step={10} unit="px" onChange={(v) => setTweak('chartHeight', v)} />
        <TweakToggle label="Watchlist sparklines" value={tw.sparklines} onChange={(v) => setTweak('sparklines', v)} />
      </TweaksPanel>
    </div>
  );
}

/* ---------------- Triggered-alerts banner ---------------- */
function alertCurrent(stock, a) {
  return (a.mode || 'price') === 'pct'
    ? `${stock.changePct >= 0 ? '+' : ''}${stock.changePct.toFixed(2)}% today`
    : `$${MD.fmtPx(stock.price)}`;
}
function alertRule(a) {
  const v = (a.mode || 'price') === 'pct' ? `${a.value > 0 ? '+' : ''}${a.value}%` : `$${MD.fmtPx(a.value)}`;
  return `${a.type === 'above' ? 'above' : 'below'} ${v}`;
}
function AlertsBanner({ triggered, onSelect, onDismiss }) {
  return (
    <div className="alert-banner">
      <div className="ab-lead">
        <span className="ab-badge"><Ico d={I.alert} size={15} /></span>
        <span className="ab-title">{triggered.length} alert{triggered.length > 1 ? 's' : ''} triggered</span>
      </div>
      <div className="ab-items">
        {triggered.map((t, i) => (
          <button key={i} className={'ab-chip ' + t.a.type} onClick={() => onSelect(t.tk)} title={'View ' + t.tk}>
            <b className="tk">{t.tk}</b>
            <span className="cur">{alertCurrent(t.stock, t.a)}</span>
            <span className="rule"><Ico d={t.a.type === 'above' ? I.trendUp : I.trendDown} size={11} />{alertRule(t.a)}</span>
          </button>
        ))}
      </div>
      <button className="ab-x" onClick={onDismiss} title="Dismiss"><Ico d={I.x} size={15} /></button>
    </div>
  );
}

/* ---------------- Topbar ---------------- */
function Topbar({ now, onDigest, query, setQuery, onRefresh, refreshing, lastRefresh }) {
  const open = now.getDay() >= 1 && now.getDay() <= 5 && now.getHours() >= 9 && now.getHours() < 16;
  const updated = lastRefresh ? new Date(lastRefresh).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null;
  return (
    <header className="topbar">
      <div className="brand"><LogoMark size={32} /><div className="brand-name">Stock Tracker<span>market intelligence</span></div></div>
      <div className="searchbox">
        <Ico d={I.search} size={15} />
        <input placeholder="Search" value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <div className="topbar-spacer" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600 }}>
          <span className="pulse-dot" style={{ background: open ? 'var(--up)' : 'var(--ink-3)' }} />
          {open ? 'Markets open' : 'Markets closed'}
        </div>
        <div className="clock"><b>{now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</b><span>{now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} ET</span></div>
      </div>
      <span className="topbar-div" />
      <button className="btn btn-ghost btn-sm" onClick={onRefresh} disabled={refreshing} title={updated ? 'Last refreshed ' + updated : 'Refresh prices, news, risk & AI'}>
        <Ico d={I.refresh} size={14} className={refreshing ? 'spin' : ''} />{refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
      <button className="btn btn-accent" onClick={onDigest}><Ico d={I.sparkle} size={15} className="spark" fill="currentColor" /><span style={{ color: '#fff' }}>Daily Digest</span></button>
    </header>
  );
}

/* ---------------- Watchlist rail ---------------- */
function Rail({ stocks, all, selected, onSelect, onAdd, sparklines, loading, onReorder, reorderable }) {
  const dragTk = useRef(null);
  const [overTk, setOverTk] = useState(null);
  return (
    <aside className="rail">
      <div className="rail-head"><span className="rail-title">Watchlist</span><span className="rail-count">{all.length}</span></div>
      <div className="rail-list">
        {stocks.map(s => {
          const up = s.changePct >= 0;
          const spark = s.daily.slice(-30).map(d => d.c);
          const cls = 'wl' + (s.tk === selected ? ' active' : '') + (reorderable ? ' draggable' : '') + (overTk === s.tk ? ' dragover' : '');
          return (
            <div key={s.tk} className={cls} onClick={() => onSelect(s.tk)}
              draggable={reorderable}
              onDragStart={(e) => { dragTk.current = s.tk; e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => { if (reorderable && dragTk.current && dragTk.current !== s.tk) { e.preventDefault(); setOverTk(s.tk); } }}
              onDragLeave={() => setOverTk(o => (o === s.tk ? null : o))}
              onDrop={(e) => { e.preventDefault(); if (dragTk.current && dragTk.current !== s.tk) onReorder(dragTk.current, s.tk); dragTk.current = null; setOverTk(null); }}
              onDragEnd={() => { dragTk.current = null; setOverTk(null); }}>
              <div className="wl-left">
                <div className="wl-tk"><b>{s.tk}</b></div>
                <div className="wl-name">{s.name}</div>
              </div>
              <div className="wl-right">
                {sparklines && <Sparkline data={spark} up={up} color={up ? 'var(--up)' : 'var(--down)'} />}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span className="wl-price num">{MD.fmtPx(s.price)}</span>
                </div>
                <span className={'pill ' + (up ? 'up' : 'down')}>{up ? '+' : ''}{s.changePct.toFixed(2)}%</span>
              </div>
            </div>
          );
        })}
        {stocks.length === 0 && <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>{loading && all.length === 0 ? 'Loading…' : 'No matches.'}</div>}
      </div>
      <div className="rail-foot"><button className="add-row" onClick={onAdd}><Ico d={I.plus} size={15} />Add a stock</button></div>
    </aside>
  );
}

/* ---------------- Detail ---------------- */
const TFS = ['1D', '1W', '1M', '3M', '1Y', '5Y'];
function Detail({ stock: s, tf, setTf, chartHeight, insight, onGenerate, newsSum, aiBusy, alerts, onAlertsChange, onRemove }) {
  const up = s.changePct >= 0;
  const bars = s.series[tf];
  const stats = [
    ['Open', MD.fmtPx(s.open)], ['Prev Close', MD.fmtPx(s.prevClose)],
    ['Day Range', s.low.toFixed(2) + ' – ' + s.high.toFixed(2)],
    ['52W Range', s.lo52.toFixed(0) + ' – ' + s.hi52.toFixed(0)],
    ['Volume', MD.fmtNum(s.volume)], ['Mkt Cap', s.mcap],
    ['P/E', s.pe], ['Sector', s.sector.split(' · ')[0]],
    ['Class', s.kind], ['Ann. Vol', (s.vol20 * 100).toFixed(0) + '%'], ['% of 52W', (((s.price - s.lo52) / (s.hi52 - s.lo52)) * 100).toFixed(0) + '%'],
  ].slice(0, 6);

  return (
    <main className="detail">
      <div className="detail-inner">
        <div className="dh">
          <div className="dh-id">
            <div className="dh-tk">
              <h1>{s.tk}</h1>
              <span className="chip">{s.kind}</span>
              <span className="chip">{s.sector}</span>
              {s.flags.length > 0 && <span className="chip flag"><Ico d={I.alert} size={12} />{s.flags.length} risk flag{s.flags.length > 1 ? 's' : ''}</span>}
            </div>
            <div className="dh-name">{s.name}</div>
          </div>
          <div className="dh-price">
            <div className="px num">{MD.fmtPx(s.price)}</div>
            <div className={'chg ' + (up ? 'up' : 'down')}>
              <Ico d={up ? I.trendUp : I.trendDown} size={15} />
              {up ? '+' : ''}{s.change.toFixed(2)} ({up ? '+' : ''}{s.changePct.toFixed(2)}%)
              <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>today</span>
            </div>
          </div>
        </div>

        {/* chart */}
        <div className="card chart-card">
          <div className="card-head">
            <h3><Ico d={I.bolt} size={14} fill="var(--accent)" />Price <span className="sub">· {tf} · candlestick</span></h3>
            <div className="tf-tabs">{TFS.map(t => <button key={t} className={t === tf ? 'active' : ''} onClick={() => setTf(t)}>{t}</button>)}</div>
          </div>
          <div className="chart-wrap"><CandleChart bars={bars} up="var(--up)" down="var(--down)" height={chartHeight} /></div>
        </div>

        {/* stats */}
        <div className="stats">{stats.map(([k, v]) => <div className="stat" key={k}><div className="k">{k}</div><div className="v">{v}</div></div>)}</div>

        {/* two columns */}
        <div className="grid2">
          <div className="col">
            <AIInsight stock={s} insight={insight} onGenerate={onGenerate} aiBusy={aiBusy} />
            <NewsCard stock={s} summary={newsSum} />
          </div>
          <div className="col">
            <RiskCard stock={s} />
            <AlertsCard stock={s} alerts={alerts} onChange={onAlertsChange} />
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', color: 'var(--down)' }} onClick={onRemove}><Ico d={I.trash} size={14} />Remove {s.tk} from watchlist</button>
          </div>
        </div>
      </div>
    </main>
  );
}

/* ---------------- AI Insight ---------------- */
function AIInsight({ stock, insight, onGenerate, aiBusy }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);
  const busy = loading || aiBusy;
  async function gen() {
    setLoading(true); setErr(false);
    try { await onGenerate(); }
    catch (e) { setErr(true); } finally { setLoading(false); }
  }
  return (
    <div className="card ai-card">
      <div className="card-head">
        <h3><Ico d={I.sparkle} size={14} fill="var(--accent)" />AI Insight <span className="ai-badge">AI</span></h3>
        {insight && !busy && <span className={'senti ' + insight.sentiment}>{insight.sentiment === 'bullish' ? '▲' : insight.sentiment === 'bearish' ? '▼' : '●'} {insight.sentiment}</span>}
      </div>
      {busy ? (
        <div className="ai-body">
          <div className="sk-line shimmer" style={{ width: '94%' }} /><div className="sk-line shimmer" style={{ width: '88%' }} /><div className="sk-line shimmer" style={{ width: '70%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, color: 'var(--ink-3)', fontSize: 12.5 }}><span className="pulse-dot" />Analyzing price action & headlines…</div>
        </div>
      ) : insight ? (
        <div className="ai-body">
          <div className="ai-thesis">{insight.thesis}</div>
          {insight.drivers.length > 0 && <>
            <div className="ai-section-label">Key drivers</div>
            <div className="ai-bullets">{insight.drivers.map((d, i) => <div className="ai-bullet" key={i}><span className="dot" />{d}</div>)}</div>
          </>}
          {insight.risk && <div className="ai-risk"><Ico d={I.alert} size={15} />{insight.risk}</div>}
        </div>
      ) : (
        <div className="ai-empty">
          <Ico d={I.sparkle} size={26} fill="var(--accent)" />
          <p>{err ? 'Could not reach the model. Check your connection and try again.' : `Generate a research read on ${stock.tk} — AI analyzes the price action, volatility, and latest headlines.`}</p>
          <button className="btn btn-accent btn-sm" onClick={gen}><Ico d={I.sparkle} size={13} fill="currentColor" className="spark" /><span style={{ color: '#fff' }}>{err ? 'Retry' : 'Generate insight'}</span></button>
        </div>
      )}
      {insight && !busy && (
        <div className="ai-foot">
          <Ico d={I.clock} size={12} />
          Generated by AI · not investment advice
          <button className="btn btn-sm" style={{ marginLeft: 'auto', color: 'var(--ink-2)', height: 26, padding: '0 9px' }} onClick={gen}><Ico d={I.refresh} size={13} />Regenerate</button>
        </div>
      )}
    </div>
  );
}

/* ---------------- News ---------------- */
function NewsCard({ stock, summary }) {
  return (
    <div className="card">
      <div className="card-head"><h3>Recent News <span className="sub">· {stock.news.length} {stock.news.length === 1 ? 'story' : 'stories'}</span></h3></div>
      {summary && (
        <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', gap: 10 }}>
          <Ico d={I.sparkle} size={14} fill="var(--accent)" style={{ marginTop: 1, flexShrink: 0 }} />
          <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}><b style={{ color: 'var(--accent-ink)' }}>AI summary · </b>{summary}</div>
        </div>
      )}
      <div className="news-list">
        {stock.news.length === 0 && <div style={{ padding: '18px', color: 'var(--ink-3)', fontSize: 13 }}>No recent headlines for {stock.tk}.</div>}
        {stock.news.map((n, i) => {
          const inner = (
            <>
              <div className="news-meta"><span className="news-src">{n.src}</span><span className="news-dot" /><span>{n.time}</span></div>
              <div className="news-head">{n.head}</div>
            </>
          );
          return n.url ? (
            <a className="news-item news-link" key={i} href={n.url} target="_blank" rel="noopener noreferrer">{inner}</a>
          ) : (
            <div className="news-item" key={i}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Risk ---------------- */
function RiskCard({ stock }) {
  return (
    <div className="card">
      <div className="card-head"><h3><Ico d={I.alert} size={14} />Risk Monitor</h3>{stock.flags.length === 0 && <span className="sub" style={{ color: 'var(--up)' }}>● All clear</span>}</div>
      <div style={{ padding: stock.flags.length ? '6px 0' : '18px' }}>
        {stock.flags.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>No unusual movement detected. Price, volatility, and range are within normal bounds.</div>
        ) : stock.flags.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 18px', borderBottom: i < stock.flags.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div className="alert-ico" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}><Ico d={f.kind === 'down' ? I.trendDown : f.kind === 'up' ? I.trendUp : I.bolt} size={15} /></div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{f.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Alerts ----------------
 * $ mode: alert when the price rises above / falls below a value.
 * % mode: alert on TODAY's % change rising above / falling below a value (value may be negative,
 *         e.g. "below -2%" fires when the stock is down 2%+ on the day). */
function AlertsCard({ stock, alerts, onChange }) {
  const [type, setType] = useState('above');
  const [mode, setMode] = useState('price'); // 'price' | 'pct'
  const [val, setVal] = useState('');
  function add() {
    const v = parseFloat(val);
    if (val === '' || isNaN(v)) return;
    onChange([...(alerts || []), { type, mode, value: v, id: Date.now() }]);
    setVal('');
  }
  function onInput(e) {
    let v = e.target.value;
    v = mode === 'pct'
      ? v.replace(/[^0-9.\-]/g, '').replace(/(?!^)-/g, '')  // allow a single leading minus
      : v.replace(/[^0-9.]/g, '');
    setVal(v);
  }
  const list = alerts || [];
  return (
    <div className="card">
      <div className="card-head"><h3><Ico d={I.bell} size={14} />Price Alerts</h3>{list.length > 0 && <span className="sub">{list.length} active</span>}</div>
      {list.map(a => {
        const hit = alertHit(stock, a);
        const isPct = (a.mode || 'price') === 'pct';
        const label = isPct
          ? `Today's change ${a.type === 'above' ? 'rises above' : 'falls below'} ${a.value > 0 ? '+' : ''}${a.value}%`
          : `${a.type === 'above' ? 'Rises above' : 'Falls below'} $${Number(a.value).toFixed(2)}`;
        const status = hit
          ? '⚡ Triggered — condition met'
          : isPct
            ? `Now ${stock.changePct >= 0 ? '+' : ''}${stock.changePct.toFixed(2)}% today`
            : `${Math.abs(((a.value - stock.price) / stock.price) * 100).toFixed(1)}% away`;
        return (
          <div className={'alert-item' + (hit ? ' hit' : '')} key={a.id}>
            <div className={'alert-ico ' + a.type}><Ico d={a.type === 'above' ? I.trendUp : I.trendDown} size={15} /></div>
            <div className="alert-main">
              <div className="t">{label}</div>
              <div className="s">{status}</div>
            </div>
            <button className="alert-x" onClick={() => onChange(list.filter(x => x.id !== a.id))}><Ico d={I.x} size={13} /></button>
          </div>
        );
      })}
      <div className="alert-add">
        <div className="seg"><button className={type === 'above' ? 'on' : ''} onClick={() => setType('above')}>Above</button><button className={type === 'below' ? 'on' : ''} onClick={() => setType('below')}>Below</button></div>
        <div className="seg"><button className={mode === 'price' ? 'on' : ''} onClick={() => setMode('price')}>$</button><button className={mode === 'pct' ? 'on' : ''} onClick={() => setMode('pct')}>%</button></div>
        <input className="alert-input" placeholder={mode === 'pct' ? 'e.g. -2.5' : '$ ' + stock.price.toFixed(2)} value={val} onChange={onInput} onKeyDown={e => e.key === 'Enter' && add()} />
        <button className="btn btn-ghost btn-sm" onClick={add} style={{ height: 34 }}>Set</button>
      </div>
    </div>
  );
}

/* ---------------- Daily Digest slideover ---------------- */
function Digest({ stocks, onClose, onSelect, now, cached, onResult }) {
  const [data, setData] = useState(cached || null);
  const [loading, setLoading] = useState(!cached);
  const [err, setErr] = useState(false);
  const byTk = Object.fromEntries(stocks.map(s => [s.tk, s]));
  async function gen() {
    setLoading(true); setErr(false);
    try { const r = await window.AI.digest(stocks); setData(r); onResult && onResult(r); }
    catch (e) { setErr(true); } finally { setLoading(false); }
  }
  useEffect(() => { if (!cached) gen(); }, []);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="slideover">
        <div className="so-head">
          <LogoMark size={36} />
          <div className="ti"><h2><Ico d={I.sparkle} size={16} fill="var(--accent)" />Daily Digest</h2><div className="d">{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · {stocks.length} holdings</div></div>
          <button className="so-x" onClick={onClose}><Ico d={I.x} size={16} /></button>
        </div>
        <div className="so-body">
          {loading ? (
            <>
              <div className="digest-tone"><div className="lbl">Overall tone</div><div className="sk-line shimmer" style={{ width: '95%' }} /><div className="sk-line shimmer" style={{ width: '80%' }} /><div className="sk-line shimmer" style={{ width: '60%' }} /></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: 'var(--ink-3)', fontSize: 13, justifyContent: 'center', padding: 8 }}><span className="pulse-dot" />AI is reading your watchlist…</div>
            </>
          ) : err ? (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--ink-3)' }}><p style={{ marginBottom: 16 }}>Could not generate the digest.</p><button className="btn btn-accent btn-sm" onClick={gen}>Retry</button></div>
          ) : data && (
            <>
              <div className="digest-tone"><div className="lbl">Overall tone</div><p>{data.tone}</p></div>
              {data.movers.length > 0 && <>
                <div className="digest-grp-label">Movers to watch</div>
                {data.movers.map((m, i) => { const s = byTk[m.tk]; if (!s) return null; const up = s.changePct >= 0;
                  return <div className="dmover" key={i} onClick={() => onSelect(m.tk)} style={{ cursor: 'pointer' }}>
                    <b>{m.tk}</b><div className="note">{m.note}</div><span className={'pill ' + (up ? 'up' : 'down')}>{up ? '+' : ''}{s.changePct.toFixed(2)}%</span>
                  </div>; })}
              </>}
              {data.risks.length > 0 && <>
                <div className="digest-grp-label">Risk callouts</div>
                {data.risks.map((r, i) => <div className="drisk" key={i}><Ico d={I.alert} size={15} />{r}</div>)}
              </>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--ink-3)', paddingTop: 4 }}>
                <Ico d={I.sparkle} size={12} fill="var(--accent)" />Synthesized by AI across your watchlist
                <button className="btn btn-sm" style={{ marginLeft: 'auto', color: 'var(--ink-2)', height: 28 }} onClick={gen}><Ico d={I.refresh} size={13} />Regenerate</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ---------------- Add modal ---------------- */
function AddModal({ onClose, onAdd, existing }) {
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');
  const ref = useRef(null);
  useEffect(() => { ref.current && ref.current.focus(); }, []);
  const SUGGEST = ['AAPL', 'NVDA', 'MSFT', 'AMD', 'PLTR', 'ASML', 'GOOGL', 'META'].filter(t => !existing.includes(t));
  function submit() {
    const tk = val.toUpperCase().trim();
    if (!tk) { setErr('Enter a ticker symbol.'); return; }
    if (!/^[A-Z.\-]{1,6}$/.test(tk)) { setErr('Use 1–6 letters (e.g. NVDA).'); return; }
    if (existing.includes(tk)) { setErr(tk + ' is already on your watchlist.'); return; }
    onAdd(tk);
  }
  return (
    <div className="modal">
      <div className="modal-scrim" onClick={onClose} />
      <div className="modal-card">
        <h2>Add to watchlist</h2>
        <div className="msub">Enter any ticker symbol. We'll generate a live-style profile with chart, news, and AI coverage. Connect a market-data API later to go fully live.</div>
        <div className="field">
          <label>Ticker symbol</label>
          <input ref={ref} value={val} onChange={e => { setVal(e.target.value.toUpperCase()); setErr(''); }} onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }} placeholder="e.g. NVDA" maxLength={6} />
          {err && <div className="err">{err}</div>}
          {SUGGEST.length > 0 && <div className="suggest">{SUGGEST.slice(0, 6).map(t => <button key={t} onClick={() => { setVal(t); setErr(''); }}>{t}</button>)}</div>}
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: '0 0 auto', padding: '0 18px' }}>Cancel</button>
          <button className="btn btn-accent" onClick={submit}><Ico d={I.plus} size={15} /><span style={{ color: '#fff' }}>Add stock</span></button>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
