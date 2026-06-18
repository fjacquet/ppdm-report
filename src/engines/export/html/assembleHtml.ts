import { DARK, LIGHT } from '../../../theme/palette'
import { toneHex } from '../tone'
import type {
  DeckBar,
  DeckDonut,
  DeckStack,
  ExportModel,
  ExportSection,
  ExportTheme,
  ExportTone,
} from '../types'

/** Escape text for safe HTML embedding. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function kpiCardHtml(
  k: { label: string; value: string; detail?: string; tone: ExportTone },
  p: typeof LIGHT,
): string {
  return `<div class="kpi" style="border-left-color:${toneHex(k.tone, p)}">
    <div class="kpi-v" style="color:${toneHex(k.tone, p)}">${esc(k.value)}</div>
    <div class="kpi-l">${esc(k.label)}</div>
    ${k.detail ? `<div class="kpi-d">${esc(k.detail)}</div>` : ''}
  </div>`
}

/** Small doughnut (CSS conic-gradient) with a centered label — the coverage figure. */
function donutHtml(d: DeckDonut, p: typeof LIGHT): string {
  const total = d.slices.reduce((s, x) => s + x.value, 0) || 1
  let acc = 0
  const stops = d.slices
    .map((s) => {
      const a = (acc / total) * 100
      acc += s.value
      const b = (acc / total) * 100
      return `${s.color} ${a}% ${b}%`
    })
    .join(', ')
  return `<div class="donut" style="background:conic-gradient(${stops})"><span class="donut-h" style="background:${p.bg}">${esc(d.center)}</span></div>`
}

/** Horizontal bars: localized label + fill (ratio) + value. */
function barsHtml(bars: DeckBar[]): string {
  const rows = bars
    .map((b) => {
      const w = Math.max(0, Math.min(1, b.ratio)) * 100
      return `<div class="br"><span class="br-l">${esc(b.label)}</span><span class="br-t"><span class="br-f" style="width:${w}%;background:${b.color}"></span></span><span class="br-v">${esc(b.value)}</span></div>`
    })
    .join('')
  return `<div class="bars">${rows}</div>`
}

/** Full-width tile grid (idle agents — the complete buy-list). */
function tilesHtml(tiles: string[]): string {
  return `<div class="tiles">${tiles.map((t) => `<div class="tile">${esc(t)}</div>`).join('')}</div>`
}

/** 100%-stacked posture bar with a legend (exec protection posture). */
function postureHtml(stack: DeckStack): string {
  const bar = stack.segments
    .map(
      (s) =>
        `<span style="width:${Math.max(0, Math.min(1, s.ratio)) * 100}%;background:${s.color}"></span>`,
    )
    .join('')
  const legend = stack.segments
    .map(
      (s) =>
        `<span class="lg"><i style="background:${s.color}"></i>${esc(s.label)}: ${esc(s.value)}</span>`,
    )
    .join('')
  return `<div class="posture">${bar}</div><div class="legend">${legend}</div>`
}

function sectionHtml(s: ExportSection, p: typeof LIGHT): string {
  const d = s.deck
  const head = `<h2>${esc(s.title)}</h2>${d?.subtitle ? `<p class="sub2">${esc(d.subtitle)}</p>` : ''}`
  const caveat = d?.caveat ? `<p class="cap">${esc(d.caveat)}</p>` : ''

  if (d?.tiles?.length) {
    return `<section>${head}${tilesHtml(d.tiles)}${caveat}</section>`
  }

  const left = d?.donut
    ? donutHtml(d.donut, p)
    : d?.kpiChips?.length
      ? `<div class="chips">${d.kpiChips.map((k) => kpiCardHtml(k, p)).join('')}</div>`
      : ''
  const right = d?.bars?.length ? barsHtml(d.bars) : ''
  const body =
    left || right
      ? `<div class="deck-row"><div class="deck-left">${left}</div><div class="deck-right">${right}</div></div>`
      : ''
  return `<section>${head}${body}${caveat}</section>`
}

/** Assemble a self-contained, theme-matched HTML report (inline CSS, CSP, no JS). */
export function assembleHtml(model: ExportModel, theme: ExportTheme): string {
  const p = theme === 'dark' ? DARK : LIGHT
  const css = `
    :root{color-scheme:${theme}}
    *{box-sizing:border-box}
    body{margin:0 auto;max-width:1100px;background:${p.bg};color:${p.ink};font-family:Arial,Helvetica,sans-serif;padding:32px}
    h1{font-size:26px;margin:0 0 4px} h2{font-size:19px;margin:0 0 2px}
    .sub{color:${p.muted};margin:0 0 24px} .sub2{color:${p.muted};font-size:13px;margin:0 0 14px}
    section{margin:26px 0;padding-top:18px;border-top:1px solid ${p.line}}
    .kpis{display:flex;flex-wrap:wrap;gap:14px;margin:14px 0}
    .kpi{background:${p.surface};border:1px solid ${p.line};border-left:4px solid;border-radius:10px;padding:14px 18px;min-width:150px;flex:1}
    .kpi-v{font-size:26px;font-weight:800} .kpi-l{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:${p.muted};margin-top:5px} .kpi-d{font-size:11px;color:${p.muted};margin-top:2px}
    .posture{display:flex;height:26px;border-radius:6px;overflow:hidden;margin:6px 0} .posture span{display:block}
    .legend{font-size:12px;color:${p.muted};margin-top:8px} .legend .lg{margin-right:18px} .legend i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:6px;vertical-align:middle}
    .deck-row{display:flex;align-items:center;gap:28px;margin-top:10px} .deck-left{flex:0 0 auto;display:flex;flex-direction:column;gap:10px} .deck-right{flex:1 1 auto;min-width:0}
    .chips{display:flex;flex-direction:column;gap:10px} .chips .kpi{flex:0 0 auto;min-width:150px}
    .donut{width:128px;height:128px;border-radius:50%;display:grid;place-items:center} .donut-h{width:84px;height:84px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:22px}
    .bars{display:flex;flex-direction:column;gap:10px}
    .br{display:flex;align-items:center;gap:14px} .br-l{width:190px;font-size:13px;font-weight:600;color:${p.muted};flex:0 0 auto} .br-t{flex:1;height:20px;background:${p.line};border-radius:6px;overflow:hidden;min-width:0} .br-f{display:block;height:100%;border-radius:6px} .br-v{width:88px;text-align:right;font-size:13px;font-weight:700;flex:0 0 auto;font-variant-numeric:tabular-nums}
    .tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-top:8px} .tile{background:${p.surface};border:1px solid ${p.line};border-left:3px solid ${p.accent};border-radius:9px;padding:11px 15px;font-size:13px;font-weight:600}
    .cap{font-size:11px;color:${p.muted};margin-top:10px;font-style:italic}
    footer{margin-top:36px;font-size:11px;color:${p.muted};border-top:1px solid ${p.line};padding-top:10px}
  `
  const kpis = model.kpis.map((k) => kpiCardHtml(k, p)).join('')
  const posture = model.posture ? postureHtml(model.posture) : ''
  const sections = model.sections.map((s) => sectionHtml(s, p)).join('')
  return `<!doctype html>
<html lang="${esc(model.locale)}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>${esc(model.title)} — ${esc(model.customer)}</title>
<style>${css}</style>
</head>
<body>
<h1>${esc(model.title)}</h1>
<p class="sub">${esc(model.customer)} · ${esc(model.subtitle)}</p>
<div class="kpis">${kpis}</div>
${posture}
${sections}
<footer>${esc(model.footer)}</footer>
</body>
</html>`
}
