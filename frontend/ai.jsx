// ai.jsx — real LLM calls via the FastAPI backend (/api/complete) or the design
// host's injected complete() function, with robust JSON parsing and local fallbacks.
(function () {
  function extractJSON(text) {
    if (!text) return null;
    let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const s = t.indexOf('{'), e = t.lastIndexOf('}');
    if (s === -1 || e === -1) return null;
    try { return JSON.parse(t.slice(s, e + 1)); } catch (_) {
      try { return JSON.parse(t.slice(s, e + 1).replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')); } catch (__) { return null; }
    }
  }

  // Model transport. Three tiers, in order:
  //   1. Design host — an injected complete() function is used as-is, if present.
  //   2. Our FastAPI backend  — POST /api/complete (the key lives server-side).
  //   3. Neither reachable     — throw, so each caller's catch uses a local fallback.
  // `web_search` is honored only by the backend (the news summary sets it true).
  async function complete(prompt, opts) {
    opts = opts || {};
    if (window.claude && typeof window.claude.complete === 'function') {
      return await window.claude.complete(prompt);
    }
    // Bound the call so a slow/hung model can't spin the UI forever — on timeout
    // the fetch aborts, the caller catches, and a local fallback is used.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    try {
      const res = await fetch('/api/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, web_search: !!opts.web_search }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error('backend ' + res.status);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data.text || '';
    } finally {
      clearTimeout(timer);
    }
  }

  function priceContext(s) {
    const closes = s.daily.map(d => d.c);
    const ago = (n) => closes[closes.length - 1 - n];
    const pct = (a, b) => (((a - b) / b) * 100).toFixed(1) + '%';
    const last = s.price;
    return [
      `Price ${last.toFixed(2)} (${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}% today).`,
      `1W ${pct(last, ago(5))}, 1M ${pct(last, ago(21))}, 3M ${pct(last, ago(63))}, 1Y ${pct(last, closes[0])}.`,
      `52w range ${s.lo52.toFixed(2)}–${s.hi52.toFixed(2)}; now ${(((last - s.lo52) / (s.hi52 - s.lo52)) * 100).toFixed(0)}% of range.`,
      `Annualized 20d volatility ${(s.vol20 * 100).toFixed(0)}%.`,
      s.flags.length ? `Risk signals: ${s.flags.map(f => f.label).join('; ')}.` : 'No acute risk signals.',
    ].join(' ');
  }

  // ---- deterministic local fallbacks (used when no live model is available) ----
  function localInsight(s) {
    const posNews = s.news.filter(n => n.impact === 'pos').length;
    const negNews = s.news.filter(n => n.impact === 'neg').length;
    const score = s.changePct * 0.6 + (posNews - negNews) * 1.2;
    const sentiment = score > 0.8 ? 'bullish' : score < -0.8 ? 'bearish' : 'neutral';
    const ofRange = (((s.price - s.lo52) / (s.hi52 - s.lo52)) * 100).toFixed(0);
    const thesis = `${s.tk} is trading at ${s.price.toFixed(2)}, ${s.changePct >= 0 ? 'up' : 'down'} ${Math.abs(s.changePct).toFixed(2)}% on the day and sitting ${ofRange}% of its 52-week range. ${posNews >= negNews ? 'Recent coverage skews constructive' : 'Recent coverage skews cautious'}, with annualized volatility near ${(s.vol20 * 100).toFixed(0)}%.`;
    const drivers = s.news.slice(0, 3).map(n => n.head.length > 60 ? n.head.slice(0, 57) + '…' : n.head);
    const risk = s.flags.length ? s.flags[0].label + ' — monitor closely.' : `Elevated volatility (~${(s.vol20 * 100).toFixed(0)}% annualized) can drive sharp swings.`;
    return { sentiment, thesis, drivers, risk };
  }

  async function insight(s) {
    const prompt = `You are an equity research analyst. Analyze ${s.tk} (${s.name}, ${s.sector}).
MARKET DATA: ${priceContext(s)}
RECENT HEADLINES: ${s.news.map(n => `- ${n.head} (${n.src})`).join('\n')}

Write a concise, professional read. Respond ONLY with JSON:
{
 "sentiment": "bullish" | "bearish" | "neutral",
 "thesis": "2 sentences on what's happening and why, grounded in the data above",
 "drivers": ["3 short bullet drivers, <12 words each"],
 "risk": "1 sentence flagging the key risk to watch"
}`;
    let raw;
    try { raw = await complete(prompt); } catch (_) { return localInsight(s); }
    const j = extractJSON(raw);
    if (!j || !j.thesis) return localInsight(s);
    return {
      sentiment: ['bullish', 'bearish', 'neutral'].includes(j.sentiment) ? j.sentiment : 'neutral',
      thesis: j.thesis,
      drivers: Array.isArray(j.drivers) ? j.drivers.slice(0, 4) : [],
      risk: j.risk || '',
    };
  }

  function localNews(s) {
    if (!s.news || !s.news.length) return 'No recent headlines available.';
    const top = s.news[0];
    const tail = s.news.length > 1 ? ` Coverage also notes ${s.news[1].head.charAt(0).toLowerCase() + s.news[1].head.slice(1)}.` : '';
    return `${top.head}.${tail}`.replace(/\.\./g, '.');
  }

  async function summarizeNews(s) {
    // web_search:true → the backend uses a search-capable model to ground this in
    // current, real coverage (the host path ignores the flag and summarizes input).
    const prompt = `Summarize the single most important recent development for ${s.tk} (${s.name}, ${s.sector}) in ONE punchy sentence (max 24 words). If you have current web results, prefer them; otherwise use these headlines:\n${s.news.map(n => '- ' + n.head).join('\n')}\nRespond with just the sentence, no preamble, no citations markup.`;
    let raw;
    try { raw = await complete(prompt, { web_search: true }); } catch (_) { return localNews(s); }
    return (raw || '').trim().replace(/^["']|["']$/g, '') || localNews(s);
  }

  function localDigest(stocks) {
    const sorted = [...stocks].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
    const adv = stocks.filter(s => s.changePct >= 0).length;
    const tone = `Your watchlist leans toward ${adv >= stocks.length / 2 ? 'risk-on' : 'defensive'} today, with ${adv} of ${stocks.length} names higher across semiconductors, robotics, and gold. Dispersion is led by the high-beta robotics and chip names while gold provides ballast.`;
    const movers = sorted.slice(0, 4).map(s => ({
      tk: s.tk,
      note: `${s.changePct >= 0 ? 'Up' : 'Down'} ${Math.abs(s.changePct).toFixed(1)}% — ${s.sector.split(' · ')[0].toLowerCase()} ${s.changePct >= 0 ? 'momentum' : 'pressure'}.`,
    }));
    const risks = [];
    stocks.forEach(s => s.flags.forEach(f => { if (risks.length < 3) risks.push(`${s.tk}: ${f.label}.`); }));
    if (!risks.length) risks.push('No acute risk signals across the watchlist; volatility within normal bounds.');
    return { tone, movers, risks: risks.slice(0, 3) };
  }

  async function digest(stocks) {
    const lines = stocks.map(s => `${s.tk} (${s.name}, ${s.sector}): ${s.price.toFixed(2)}, ${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}% today.${s.flags.length ? ' Flags: ' + s.flags.map(f => f.label).join(', ') + '.' : ''}${s.news && s.news[0] ? ' Top headline: "' + s.news[0].head + '".' : ''}`).join('\n');
    const prompt = `You are a portfolio analyst writing a morning brief for a watchlist of real market data. Holdings:
${lines}

Respond ONLY with JSON:
{
 "tone": "2-sentence overall read of how this watchlist is set up today, referencing the dominant themes (semiconductors, robotics, gold)",
 "movers": [{"tk":"TICKER","note":"<14 words on why it stands out"}],
 "risks": ["1-3 short risk callouts across the watchlist, <16 words each"]
}
Include 2-4 movers (the most notable up/down or flagged names).`;
    let raw;
    try { raw = await complete(prompt); } catch (_) { return localDigest(stocks); }
    const j = extractJSON(raw);
    if (!j || !j.tone) return localDigest(stocks);
    return {
      tone: j.tone,
      movers: Array.isArray(j.movers) ? j.movers.slice(0, 4) : [],
      risks: Array.isArray(j.risks) ? j.risks.slice(0, 3) : [],
    };
  }

  window.AI = { insight, summarizeNews, digest };
})();
