import { useState, useEffect, useRef } from "react";

// R1 is now purple so it doesn't clash with the red/green diff ticks on the sweep line
const RECTS = [
  { x1: 1, y1: 2, x2: 6, y2: 8, color: "#7F77DD", label: "R1" },
  { x1: 4, y1: 0, x2: 9, y2: 6, color: "#378ADD", label: "R2" },
];
const WX = [0, 10], WY = [-1, 10];

// Diff tick colors: open = bright green, close = orange — distinct from both rects
const TICK_OPEN  = "#1D9E75";  // +1 (rect opens)
const TICK_CLOSE = "#EF9F27";  // -1 (rect closes)
const SWEEP_COV  = "#E24B4A";  // covered segment bar on sweep line

const STRINGS = {
  bg: {
    sweepX:   "Позиция x =",
    r1opens:  "R1 отваря",
    r2opens:  "R2 отваря",
    r1closes: "R1 затваря",
    r2closes: "R2 затваря",
    covLabel: "covY (от diff[])",
    areaLabel:"площ досега",
    totalLabel:"обща засечка",
    diffEmpty: (sx) => `diff[] е празен — няма активни правоъгълници при x=${sx.toFixed(1)}`,
    sweeping:  (len) => `Обхождане на diff[] → covY = ${len}`,
    covered:   (a,b,len) => `[${a}..${b}): curr=${len} → +${b-a} у покрит`,
    skip:      (a,b,curr) => `[${a}..${b}): curr=${curr} → пропуск`,
    event:     (y,val,after) => `y=${y}: curr ${val>0?"+":""}${val} → ${after}`,
    explains: [
      (sx) => `x < 1 — няма активни правоъгълници. Събиране на x-граници {1,4,6,9} и итерация по ивиците между тях.`,
      (sx) => `Ивица [1,4): само R1 активен. diff[2]++ diff[8]--. Обход: curr=1 в [2,8] → covY=6. площ += 6×3 = 18.`,
      (sx) => `Ивица [4,6): R1 и R2 са едновременно активни. diff[0]++ diff[2]++ diff[6]-- diff[8]--. Обход: curr=2 в [2,6] — сливане автоматично, без двойно броене! covY=8.`,
      (sx) => `Ивица [6,9): само R2 активен. diff[0]++ diff[6]--. Обход: curr=1 в [0,6] → covY=6. площ += 6×3 = 18.`,
      (sx) => `След x=9. diff[] е празен, covY=0. Обща площ на засечката = 12 кв.у.`,
    ],
    legend: { xstrip:"x ивици", build:"строй diff[]", sweep:"обход diff[]", out:"изход" },
    lang: "EN",
  },
  en: {
    sweepX:   "Sweep x =",
    r1opens:  "R1 opens",
    r2opens:  "R2 opens",
    r1closes: "R1 closes",
    r2closes: "R2 closes",
    covLabel: "covY (from diff[])",
    areaLabel:"area so far",
    totalLabel:"total overlap",
    diffEmpty: (sx) => `diff[] empty — no active rectangles at x=${sx.toFixed(1)}`,
    sweeping:  (len) => `Sweeping diff[] → covY = ${len}`,
    covered:   (a,b,len) => `[${a}..${b}): curr=${len} → +${b-a} u covered`,
    skip:      (a,b,curr) => `[${a}..${b}): curr=${curr} → skip`,
    event:     (y,val,after) => `y=${y}: curr ${val>0?"+":""}${val} → ${after}`,
    explains: [
      (sx) => `x < 1 — no rects active. Collecting x-boundaries {1,4,6,9} and iterating strips between them.`,
      (sx) => `Strip [1,4): only R1 active. diff[2]++ diff[8]--. Sweep: curr=1 in [2,8] → covY=6. area += 6×3 = 18.`,
      (sx) => `Strip [4,6): R1 and R2 both active. diff[0]++ diff[2]++ diff[6]-- diff[8]--. Sweep: curr=2 in [2,6] — merged automatically, no double-count! covY=8.`,
      (sx) => `Strip [6,9): only R2 active. diff[0]++ diff[6]--. Sweep: curr=1 in [0,6] → covY=6. area += 6×3 = 18.`,
      (sx) => `Past x=9. diff[] empty, covY=0. Total overlap area = 12 sq.u.`,
    ],
    legend: { xstrip:"x strips", build:"build diff[]", sweep:"sweep diff[]", out:"output" },
    lang: "БГ",
  },
};

const CODE = [
  { tag: "",       s: '#pragma GCC optimize("Ofast,unroll-loops")' },
  { tag: "",       s: "#include <bits/stdc++.h>" },
  { tag: "",       s: "#define ll long long" },
  { tag: "",       s: "using namespace std;" },
  { tag: "",       s: "" },
  { tag: "",       s: "int main() {" },
  { tag: "",       s: "    ios_base::sync_with_stdio(0); cin.tie(0);" },
  { tag: "",       s: "    int n; cin >> n;" },
  { tag: "",       s: "    vector<array<int,4>> R(n); // {x1,y1,x2,y2}" },
  { tag: "",       s: "    for (auto& r : R) cin >> r[0]>>r[1]>>r[2]>>r[3];" },
  { tag: "",       s: "" },
  { tag: "xstrip", s: "    // collect & deduplicate x-boundaries" },
  { tag: "xstrip", s: "    vector<int> xs;" },
  { tag: "xstrip", s: "    for (auto& r : R) { xs.push_back(r[0]); xs.push_back(r[2]); }" },
  { tag: "xstrip", s: "    sort(xs.begin(), xs.end());" },
  { tag: "xstrip", s: "    xs.erase(unique(xs.begin(),xs.end()),xs.end());" },
  { tag: "",       s: "" },
  { tag: "xstrip", s: "    ll area = 0;" },
  { tag: "xstrip", s: "    for (int i = 0; i+1 < (int)xs.size(); i++) {" },
  { tag: "xstrip", s: "        ll xL = xs[i], xR = xs[i+1];" },
  { tag: "",       s: "" },
  { tag: "build",  s: "        // difference array on y for active rectangles" },
  { tag: "build",  s: "        map<int,int> diff;" },
  { tag: "build",  s: "        for (auto& r : R) {" },
  { tag: "build",  s: "            if (r[0] <= xL && xL < r[2]) {" },
  { tag: "build",  s: "                diff[r[1]]++;  // opens at y1" },
  { tag: "build",  s: "                diff[r[3]]--;  // closes at y2" },
  { tag: "build",  s: "            }" },
  { tag: "build",  s: "        }" },
  { tag: "",       s: "" },
  { tag: "sweep",  s: "        // sweep diff[] — same pattern as 1D segment union" },
  { tag: "sweep",  s: "        ll covY = 0, curr = 0, prev = 0;" },
  { tag: "sweep",  s: "        bool first = true;" },
  { tag: "sweep",  s: "        for (auto [y, val] : diff) {" },
  { tag: "sweep",  s: "            if (!first && curr > 0)" },
  { tag: "sweep",  s: "                covY += y - prev;  // this segment is covered" },
  { tag: "sweep",  s: "            curr += val;" },
  { tag: "sweep",  s: "            prev = y; first = false;" },
  { tag: "sweep",  s: "        }" },
  { tag: "",       s: "" },
  { tag: "xstrip", s: "        area += covY * (xR - xL);  // strip contribution" },
  { tag: "xstrip", s: "    }" },
  { tag: "",       s: "" },
  { tag: "out",    s: '    cout << area << "\\n";' },
  { tag: "",       s: "    return 0;" },
  { tag: "",       s: "}" },
];

const COLORS = {
  xstrip: { bg: "rgba(239,159,39,0.13)",  border: "#EF9F27" },
  build:  { bg: "rgba(55,138,221,0.13)",  border: "#378ADD" },
  sweep:  { bg: "rgba(29,158,117,0.13)",  border: "#1D9E75" },
  out:    { bg: "rgba(140,60,200,0.13)",  border: "#9C3CC8" },
};

function buildDiff(sx) {
  const diff = {};
  for (const r of RECTS) {
    if (r.x1 <= sx && sx < r.x2) {
      diff[r.y1] = (diff[r.y1] ?? 0) + 1;
      diff[r.y2] = (diff[r.y2] ?? 0) - 1;
    }
  }
  return diff;
}

function sweepDiff(diff) {
  const keys = Object.keys(diff).map(Number).sort((a, b) => a - b);
  let len = 0, curr = 0, prev = null;
  const segs = [], rows = [];
  for (const k of keys) {
    if (prev !== null) {
      rows.push({ from: prev, to: k, curr, covered: curr > 0 });
      if (curr > 0) { len += k - prev; segs.push([prev, k]); }
    }
    curr += diff[k];
    rows.push({ isEvent: true, y: k, val: diff[k], currAfter: curr });
    prev = k;
  }
  return { len, segs, rows, keys };
}

function covY(sx) {
  const diff = buildDiff(sx);
  return sweepDiff(diff);
}

function sweepArea(upTo) {
  const xs = [...new Set(RECTS.flatMap(r => [r.x1, r.x2]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    if (xs[i] >= upTo) break;
    const xEnd = Math.min(xs[i + 1], upTo);
    area += covY((xs[i] + xEnd) / 2).len * (xEnd - xs[i]);
  }
  return area;
}

const TOTAL = (() => {
  const xs = [...new Set(RECTS.flatMap(r => [r.x1, r.x2]))].sort((a, b) => a - b);
  let a = 0;
  for (let i = 0; i + 1 < xs.length; i++)
    a += covY((xs[i] + xs[i + 1]) / 2).len * (xs[i + 1] - xs[i]);
  return a;
})();

function activeTag(sx) {
  if (sx <= 1) return "xstrip";
  if (!Object.keys(buildDiff(sx)).length) return "xstrip";
  return (sx % 1) < 0.5 ? "build" : "sweep";
}

function getExplain(sx, T) {
  if (sx < 1)  return T.explains[0](sx);
  if (sx < 4)  return T.explains[1](sx);
  if (sx < 6)  return T.explains[2](sx);
  if (sx < 9)  return T.explains[3](sx);
  return T.explains[4](sx);
}

// Canvas: fixed 4:3 logical size, scales via CSS
function Canvas({ sx }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d");
    const W = 560, H = 420;
    const P = { l: 44, r: 10, t: 28, b: 32 };
    const PW = W - P.l - P.r, PH = H - P.t - P.b;
    const wx = x => P.l + (x - WX[0]) / (WX[1] - WX[0]) * PW;
    const wy = y => P.t + (WY[1] - y) / (WY[1] - WY[0]) * PH;

    const dark = matchMedia("(prefers-color-scheme:dark)").matches;
    const tc = dark ? "#c2c0b6" : "#3d3d3a";

    ctx.clearRect(0, 0, W, H);

    // grid
    ctx.strokeStyle = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= 10; x++) { ctx.beginPath(); ctx.moveTo(wx(x), P.t); ctx.lineTo(wx(x), P.t + PH); ctx.stroke(); }
    for (let y = -1; y <= 10; y++) { ctx.beginPath(); ctx.moveTo(P.l, wy(y)); ctx.lineTo(P.l + PW, wy(y)); ctx.stroke(); }

    // axes
    ctx.strokeStyle = dark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(P.l, P.t + PH); ctx.lineTo(P.l + PW, P.t + PH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(P.l, P.t); ctx.lineTo(P.l, P.t + PH); ctx.stroke();

    // tick labels
    ctx.fillStyle = tc; ctx.textAlign = "center"; ctx.font = "11px sans-serif";
    for (let x = 0; x <= 10; x++) ctx.fillText(x, wx(x), P.t + PH + 14);
    ctx.textAlign = "right";
    for (let y = 0; y <= 10; y += 2) ctx.fillText(y, P.l - 4, wy(y) + 4);

    // event dashed verticals
    ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    for (const ex of [1, 4, 6, 9]) {
      const past = ex <= sx;
      ctx.strokeStyle = past ? "rgba(239,159,39,0.4)" : (dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.09)");
      ctx.beginPath(); ctx.moveTo(wx(ex), P.t); ctx.lineTo(wx(ex), P.t + PH); ctx.stroke();
      ctx.fillStyle = past ? "#EF9F27" : (dark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.25)");
      ctx.font = "10px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("x=" + ex, wx(ex), P.t - 7);
    }
    ctx.setLineDash([]);

    // swept area tint
    const { segs } = covY(sx);
    if (sx > 1) {
      for (const [ya, yb] of segs) {
        ctx.fillStyle = "rgba(226,75,74,0.1)";
        ctx.fillRect(wx(1), wy(yb), wx(sx) - wx(1), wy(ya) - wy(yb));
      }
    }

    // rectangles
    for (const r of RECTS) {
      const x = wx(r.x1), y = wy(r.y2), w = wx(r.x2) - wx(r.x1), h = wy(r.y1) - wy(r.y2);
      ctx.fillStyle = r.color + "22"; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = r.color; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = r.color; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "left";
      ctx.fillText(r.label, x + 5, y + 15);
    }

    // overlap hatching
    ctx.save();
    ctx.beginPath(); ctx.rect(wx(4), wy(6), wx(6) - wx(4), wy(2) - wy(6)); ctx.clip();
    ctx.strokeStyle = "rgba(140,60,200,0.3)"; ctx.lineWidth = 1.5;
    for (let d = -80; d < 80; d += 9) {
      ctx.beginPath(); ctx.moveTo(wx(4) + d, wy(6)); ctx.lineTo(wx(4) + d + 60, wy(2)); ctx.stroke();
    }
    ctx.restore();
    ctx.setLineDash([3, 3]); ctx.strokeStyle = "rgba(140,60,200,0.5)"; ctx.lineWidth = 1.5;
    ctx.strokeRect(wx(4), wy(6), wx(6) - wx(4), wy(2) - wy(6));
    ctx.setLineDash([]);

    // === SWEEP LINE ===
    // soft glow
    ctx.save(); ctx.globalAlpha = 0.12;
    ctx.strokeStyle = "#EF9F27"; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(wx(sx), P.t); ctx.lineTo(wx(sx), P.t + PH); ctx.stroke();
    ctx.restore();
    // main line
    ctx.strokeStyle = "#EF9F27"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(wx(sx), P.t); ctx.lineTo(wx(sx), P.t + PH); ctx.stroke();
    // direction arrow (pointing right)
    const ax = wx(sx), ay = P.t + PH * 0.35;
    ctx.fillStyle = "#EF9F27";
    ctx.beginPath(); ctx.moveTo(ax + 9, ay); ctx.lineTo(ax, ay - 5); ctx.lineTo(ax, ay + 5); ctx.closePath(); ctx.fill();
    // projection dot on x-axis
    ctx.beginPath(); ctx.arc(wx(sx), P.t + PH, 4.5, 0, Math.PI * 2); ctx.fillStyle = "#EF9F27"; ctx.fill();
    // label above
    ctx.fillStyle = "#EF9F27"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("x=" + sx.toFixed(1), wx(sx), P.t - 15);

    // diff ticks ON the sweep line
    // open (+1) = bright teal, close (-1) = orange — neither matches rect colors (purple/blue)
    const diff = buildDiff(sx);
    const dkeys = Object.keys(diff).map(Number).sort((a, b) => a - b);
    for (const k of dkeys) {
      const v = diff[k], py = wy(k);
      const col = v > 0 ? TICK_OPEN : TICK_CLOSE;
      // tick dash across line
      ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(wx(sx) - 8, py); ctx.lineTo(wx(sx) + 8, py); ctx.stroke();
      // small circle at intersection
      ctx.beginPath(); ctx.arc(wx(sx), py, 3, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
      // label to right with background pill
      const lbl = (v > 0 ? "+" : "") + v + "  y=" + k;
      ctx.font = "bold 10px sans-serif"; ctx.textAlign = "left";
      const tw = ctx.measureText(lbl).width;
      ctx.fillStyle = dark ? "rgba(20,20,20,0.7)" : "rgba(255,255,255,0.8)";
      ctx.beginPath(); ctx.roundRect(wx(sx) + 11, py - 8, tw + 8, 16, 4); ctx.fill();
      ctx.fillStyle = col;
      ctx.fillText(lbl, wx(sx) + 15, py + 3);
    }

    // covered segment bars on sweep line (bright red, distinct from purple R1)
    for (const [ya, yb] of segs) {
      ctx.strokeStyle = SWEEP_COV; ctx.lineWidth = 6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(wx(sx), wy(ya)); ctx.lineTo(wx(sx), wy(yb)); ctx.stroke();
    }

    // diff[] mini legend top-left on canvas
    if (dkeys.length) {
      let yy = P.t + 10;
      ctx.font = "10px monospace"; ctx.textAlign = "left";
      ctx.fillStyle = dark ? "rgba(200,200,200,0.5)" : "rgba(60,60,60,0.4)";
      ctx.fillText("diff[]:", 5, yy); yy += 14;
      for (const k of dkeys) {
        const v = diff[k];
        ctx.fillStyle = v > 0 ? TICK_OPEN : TICK_CLOSE;
        ctx.fillText(`[${k}]: ${v > 0 ? "+" : ""}${v}`, 5, yy); yy += 13;
      }
    }

  }, [sx]);

  // Fixed internal resolution 560×420 (4:3), CSS width=100% scales it proportionally
  return (
    <canvas ref={ref} width={560} height={420}
      style={{ width: "100%", aspectRatio: "560/420", display: "block", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)" }} />
  );
}

function CodePanel({ sx }) {
  const tag = activeTag(sx);
  return (
    <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, overflow: "hidden", background: "var(--color-background-secondary)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "6px 12px", fontSize: 10, fontWeight: 500, color: "var(--color-text-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ letterSpacing: ".04em" }}>sweep_area.cpp</span>
        {Object.entries(COLORS).map(([t, c]) => (
          <span key={t} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: c.border, display: "inline-block" }} />
            <span style={{ fontSize: 9, color: "var(--color-text-tertiary)" }}>{t}</span>
          </span>
        ))}
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        <pre style={{ 
            fontFamily: "var(--font-mono,monospace)", 
            fontSize: 10.5, 
            lineHeight: 1.72, 
            padding: "6px 0", 
            margin: 0, 
            color: "var(--color-text-primary)",
            textAlign: "left",  // add this
          }}>
          {CODE.map((line, i) => {
            const c = COLORS[line.tag];
            const hl = line.tag === tag;
            return (
              <span key={i} style={{
                  display: "block", 
                  padding: "0 12px",
                  textAlign: "left",  // add this
                  background: hl ? c?.bg : "transparent",
                  borderLeft: hl ? `2px solid ${c?.border}` : "2px solid transparent",
                  transition: "background 0.15s",
                }}>
                {line.s || "\u00A0"}
              </span>
            );
          })}
        </pre>
      </div>
    </div>
  );
}

function DiffWalk({ sx, T }) {
  const diff = buildDiff(sx);
  const { len, rows } = sweepDiff(diff);
  if (!rows.length) return (
    <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", padding: "8px 12px", background: "var(--color-background-secondary)", borderRadius: 8 }}>
      {T.diffEmpty(sx)}
    </div>
  );
  return (
    <div style={{ fontFamily: "var(--font-mono,monospace)", fontSize: 11.5, background: "var(--color-background-secondary)", borderRadius: 8, padding: "8px 14px", display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 5, fontFamily: "var(--font-sans,sans-serif)" }}>
        {T.sweeping(len)}
      </div>
      {rows.map((r, i) => r.isEvent ? (
        <div key={i} style={{ color: r.val > 0 ? TICK_OPEN : TICK_CLOSE, fontWeight: 500 }}>
          {T.event(r.y, r.val, r.currAfter)}
        </div>
      ) : (
        <div key={i} style={{ color: r.covered ? SWEEP_COV : "var(--color-text-tertiary)", paddingLeft: 12 }}>
          {r.covered ? T.covered(r.from, r.to, r.curr) : T.skip(r.from, r.to, r.curr)}
        </div>
      ))}
    </div>
  );
}

export default function SweepLine() {
  const [val, setVal] = useState(15);
  const [lang, setLang] = useState("bg");
  const T = STRINGS[lang];
  const sx = parseFloat((val / 10).toFixed(1));
  const { len } = covY(sx);
  const area = sweepArea(sx);

  const events = [
    { x: 1, label: T.r1opens }, { x: 4, label: T.r2opens },
    { x: 6, label: T.r1closes }, { x: 9, label: T.r2closes },
  ];

  return (
    <div style={{ fontFamily: "var(--font-sans,sans-serif)", padding: "12px 0", display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Slider + lang toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>{T.sweepX}</span>
        <input type="range" min={0} max={100} step={1} value={val} onChange={e => setVal(+e.target.value)} style={{ flex: 1 }} />
        <span style={{ fontSize: 14, fontWeight: 500, minWidth: 32 }}>{sx.toFixed(1)}</span>
        <button
          onClick={() => setLang(l => l === "bg" ? "en" : "bg")}
          style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", cursor: "pointer", whiteSpace: "nowrap" }}>
          {T.lang}
        </button>
      </div>

      {/* Event chips */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {events.map(({ x, label }) => {
          const on = Math.abs(x - sx) < 0.15, past = x < sx && !on;
          return (
            <span key={x} style={{
              fontSize: 11, padding: "3px 9px", borderRadius: 20,
              border: "0.5px solid var(--color-border-secondary)",
              background: on ? "#EF9F27" : past ? "var(--color-background-success)" : "var(--color-background-secondary)",
              color: on ? "#412402" : past ? "var(--color-text-success)" : "var(--color-text-secondary)",
              fontWeight: on ? 500 : 400, transition: "all 0.2s",
            }}>
              x={x}: {label}
            </span>
          );
        })}
      </div>

      {/* Canvas + Code — fixed aspect ratio grid */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(0,0.85fr)", gap: 10 }}>
        <Canvas sx={sx} />
        <CodePanel sx={sx} />
      </div>

      {/* Diff walkthrough */}
      <DiffWalk sx={sx} T={T} />

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
        {[
          { label: T.covLabel, val: len + " у" },
          { label: T.areaLabel, val: area.toFixed(1) + " у²" },
          { label: T.totalLabel, val: TOTAL + " у²" },
        ].map(({ label, val: v }) => (
          <div key={label} style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 500, marginTop: 2 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Explanation */}
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6, padding: "8px 12px", background: "var(--color-background-secondary)", borderRadius: 8, borderLeft: "2px solid #EF9F27" }}>
        {getExplain(sx, T)}
      </div>

    </div>
  );
}