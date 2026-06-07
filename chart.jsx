// chart.jsx — canvas candlestick chart with crosshair + tooltip and an area-baseline glow.
function CandleChart({ bars, up, down, height = 300, accent }) {
  const wrapRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const [w, setW] = React.useState(800);
  const [hover, setHover] = React.useState(null); // {x, i}

  React.useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const padL = 6, padR = 56, padT = 14, padB = 26;
  const innerW = Math.max(50, w - padL - padR);
  const innerH = height - padT - padB;

  const { min, max } = React.useMemo(() => {
    if (!bars.length) return { min: 0, max: 1 };
    let mn = Infinity, mx = -Infinity;
    bars.forEach(b => { mn = Math.min(mn, b.l); mx = Math.max(mx, b.h); });
    const pad = (mx - mn) * 0.08 || 1; return { min: mn - pad, max: mx + pad };
  }, [bars]);

  const yOf = (p) => padT + (1 - (p - min) / (max - min)) * innerH;
  const xOf = (i) => padL + (bars.length <= 1 ? innerW / 2 : (i / (bars.length - 1)) * innerW);

  React.useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr; cv.height = height * dpr;
    cv.style.width = w + 'px'; cv.style.height = height + 'px';
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, height);
    if (!bars.length) return;

    const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const upC = cssVar('--up') || up, downC = cssVar('--down') || down;
    const gridC = cssVar('--border') || '#eee', inkC = cssVar('--ink-3') || '#999';

    // horizontal gridlines + price labels
    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.textBaseline = 'middle';
    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const p = min + (max - min) * (i / ticks);
      const y = yOf(p);
      ctx.strokeStyle = gridC; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, y + .5); ctx.lineTo(padL + innerW, y + .5); ctx.stroke();
      ctx.fillStyle = inkC; ctx.textAlign = 'left';
      ctx.fillText(p >= 1000 ? Math.round(p).toLocaleString() : p.toFixed(2), padL + innerW + 8, y);
    }

    // baseline area glow under closes
    const lastUp = bars[bars.length - 1].c >= bars[0].o;
    const lineC = lastUp ? upC : downC;
    ctx.beginPath();
    bars.forEach((b, i) => { const x = xOf(i), y = yOf(b.c); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    const grad = ctx.createLinearGradient(0, padT, 0, padT + innerH);
    grad.addColorStop(0, hexA(lineC, 0.13)); grad.addColorStop(1, hexA(lineC, 0));
    ctx.lineTo(xOf(bars.length - 1), padT + innerH); ctx.lineTo(xOf(0), padT + innerH); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    // candles
    const slot = innerW / bars.length;
    const cw = Math.max(1.5, Math.min(13, slot * 0.62));
    bars.forEach((b, i) => {
      const x = xOf(i); const green = b.c >= b.o; const col = green ? upC : downC;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1;
      // wick
      ctx.beginPath(); ctx.moveTo(x, yOf(b.h)); ctx.lineTo(x, yOf(b.l)); ctx.stroke();
      // body
      const yo = yOf(b.o), yc = yOf(b.c);
      const top = Math.min(yo, yc); const bh = Math.max(1.5, Math.abs(yc - yo));
      if (green) { ctx.globalAlpha = 1; ctx.fillRect(x - cw / 2, top, cw, bh); }
      else { ctx.fillRect(x - cw / 2, top, cw, bh); }
      ctx.globalAlpha = 1;
    });

    // crosshair
    if (hover) {
      const b = bars[hover.i]; const x = xOf(hover.i);
      ctx.strokeStyle = hexA(inkC, .5); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + innerH); ctx.stroke();
      const y = yOf(b.c);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + innerW, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = cssVar('--ink') || '#1a1a17';
      const lbl = b.c.toFixed(2);
      ctx.fillRect(padL + innerW + 2, y - 9, padR - 2, 18);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(lbl, padL + innerW + 2 + (padR - 2) / 2, y);
      // dot
      ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fillStyle = lineC; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }, [bars, w, height, hover, min, max]);

  function onMove(e) {
    const r = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    const i = Math.round(((x - padL) / innerW) * (bars.length - 1));
    if (i < 0 || i >= bars.length) { setHover(null); return; }
    setHover({ i, x: xOf(i) });
  }

  const hb = hover ? bars[hover.i] : null;
  const tipLeft = hover ? Math.min(Math.max(hover.x + 12, 8), w - 168) : 0;
  const date = hb ? new Date(hb.t) : null;

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <canvas ref={canvasRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ display: 'block', cursor: 'crosshair' }} />
      {hb && (
        <div className="ctip" style={{ opacity: 1, left: tipLeft, top: 10 }}>
          <div className="dt">{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{bars.length > 60 ? '' : ' ' + date.toLocaleTimeString('en-US', { hour: 'numeric' })}</div>
          <div className="row"><span>O</span><span>{hb.o.toFixed(2)}</span></div>
          <div className="row"><span>H</span><span>{hb.h.toFixed(2)}</span></div>
          <div className="row"><span>L</span><span>{hb.l.toFixed(2)}</span></div>
          <div className="row"><span>C</span><span>{hb.c.toFixed(2)}</span></div>
        </div>
      )}
    </div>
  );
}

// tiny sparkline for watchlist rows
function Sparkline({ data, up, color, width = 58, height = 26 }) {
  const min = Math.min(...data), max = Math.max(...data);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
    return [x, y];
  });
  const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = d + ` L${width} ${height} L0 ${height} Z`;
  const id = React.useMemo(() => 'sg' + Math.random().toString(36).slice(2, 7), []);
  return (
    <svg width={width} height={height} className="spark" style={{ overflow: 'visible' }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.22" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function hexA(hex, a) {
  hex = (hex || '#000').trim();
  if (hex.startsWith('rgb')) return hex.replace(')', `, ${a})`).replace('rgb', 'rgba');
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

Object.assign(window, { CandleChart, Sparkline });
