import { DARK, LIGHT } from '../../../theme/palette'
import { toneHex } from '../tone'
import type { ExportModel, ExportSection, ExportTheme, ExportTone } from '../types'

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

function chartHtml(chart: NonNullable<ExportSection['chart']>): string {
  const total = chart.slices.reduce((s, x) => s + x.value, 0) || 1
  const bar = chart.slices
    .map((s) => `<span style="width:${(s.value / total) * 100}%;background:${s.color}"></span>`)
    .join('')
  const legend = chart.slices
    .map(
      (s) =>
        `<span class="lg"><i style="background:${s.color}"></i>${esc(s.name)}: ${s.value}</span>`,
    )
    .join('')
  return `<div class="bar">${bar}</div><div class="legend">${legend}</div>`
}

function tableHtml(table: NonNullable<ExportSection['table']>): string {
  const head = table.columns.map((c) => `<th>${esc(c)}</th>`).join('')
  const body = table.rows
    .map((r) => `<tr>${r.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`)
    .join('')
  const caption = table.caption ? `<p class="cap">${esc(table.caption)}</p>` : ''
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${caption}`
}

function sectionHtml(s: ExportSection, p: typeof LIGHT): string {
  const kpis = s.kpis?.length
    ? `<div class="kpis">${s.kpis.map((k) => kpiCardHtml(k, p)).join('')}</div>`
    : ''
  const notes = s.notes?.length
    ? `<ul class="notes">${s.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`
    : ''
  return `<section><h2>${esc(s.title)}</h2>${kpis}${s.chart ? chartHtml(s.chart) : ''}${notes}${s.table ? tableHtml(s.table) : ''}</section>`
}

/** Assemble a self-contained, theme-matched HTML report (inline CSS, CSP, no JS). */
export function assembleHtml(model: ExportModel, theme: ExportTheme): string {
  const p = theme === 'dark' ? DARK : LIGHT
  const css = `
    :root{color-scheme:${theme}}
    *{box-sizing:border-box}
    body{margin:0;background:${p.bg};color:${p.ink};font-family:Arial,Helvetica,sans-serif;padding:32px}
    h1{font-size:24px;margin:0 0 4px} h2{font-size:18px;margin:28px 0 12px;border-bottom:2px solid ${p.accent};padding-bottom:4px}
    .sub{color:${p.muted};margin:0 0 24px}
    .kpis{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0}
    .kpi{background:${p.surface};border-left:4px solid;border-radius:8px;padding:12px 16px;min-width:150px}
    .kpi-v{font-size:24px;font-weight:800} .kpi-l{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:${p.muted};margin-top:4px} .kpi-d{font-size:11px;color:${p.muted};margin-top:2px}
    .bar{display:flex;height:18px;border-radius:5px;overflow:hidden;margin:8px 0} .bar span{display:block}
    .legend{font-size:12px;color:${p.muted}} .legend .lg{margin-right:14px} .legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:middle}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px} th{text-align:left;color:${p.muted};border-bottom:1px solid ${p.line};padding:5px 8px} td{padding:5px 8px;border-bottom:1px solid ${p.line}}
    .cap{font-size:11px;color:${p.muted};margin-top:6px} .notes{font-size:12px;color:${p.muted};margin:8px 0;padding-left:18px}
    footer{margin-top:32px;font-size:11px;color:${p.muted};border-top:1px solid ${p.line};padding-top:8px}
  `
  const kpis = model.kpis.map((k) => kpiCardHtml(k, p)).join('')
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
${sections}
<footer>${esc(model.footer)}</footer>
</body>
</html>`
}
