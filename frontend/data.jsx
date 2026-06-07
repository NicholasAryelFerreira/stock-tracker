// data.jsx — real market data via the backend (/api/stocks, powered by yfinance).
// No mock data: every price, candle, stat, and headline comes from Yahoo Finance.
(function () {
  async function fetchStocks(tickers, opts) {
    opts = opts || {};
    const q = encodeURIComponent((tickers || []).join(','));
    const res = await fetch('/api/stocks?tickers=' + q + (opts.fresh ? '&fresh=1' : ''));
    if (!res.ok) throw new Error('stocks ' + res.status);
    return await res.json(); // { stocks: { TK: {...} }, errors: { TK: msg } }
  }

  function fmtNum(n) {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
  }
  function fmtPx(n) {
    if (n == null || isNaN(n)) return '—';
    return n >= 1000 ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : n.toFixed(2);
  }

  window.MarketData = {
    fetchStocks, fmtNum, fmtPx,
    DEFAULT_TICKERS: ['GLD', 'TSM', 'BOTT', 'HUMN', 'ISRG', 'KOID', 'NVMI', 'TSEM'],
  };
})();
