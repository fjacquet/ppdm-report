import pptxgen from 'pptxgenjs'
import { DARK, LIGHT } from '../../../theme/palette'
import { toneHex } from '../tone'
import type { ExportModel, ExportSection, ExportTheme } from '../types'

/** pptxgenjs wants hex without the leading '#'. */
const hx = (c: string) => c.replace('#', '')

function addSection(pptx: pptxgen, s: ExportSection, p: typeof LIGHT, bg: string) {
  const ink = hx(p.ink)
  const muted = hx(p.muted)
  const slide = pptx.addSlide()
  slide.background = { color: bg }
  slide.addText(s.title, {
    x: 0.5,
    y: 0.3,
    w: 12.3,
    h: 0.6,
    fontSize: 22,
    bold: true,
    color: ink,
    fontFace: 'Arial',
  })

  let y = 1.1
  if (s.kpis?.length) {
    s.kpis.forEach((k, i) => {
      slide.addText(
        [
          {
            text: `${k.value}  `,
            options: { bold: true, color: hx(toneHex(k.tone, p)), fontSize: 18 },
          },
          { text: k.label, options: { color: muted, fontSize: 11 } },
        ],
        { x: 0.5 + i * 4.2, y, w: 4, h: 0.5, fontFace: 'Arial' },
      )
    })
    y += 0.8
  }

  const hasChart = !!s.chart
  if (s.chart) {
    slide.addChart(
      s.chart.kind === 'pie' ? 'doughnut' : 'bar',
      [
        {
          name: s.title,
          labels: s.chart.slices.map((x) => x.name),
          values: s.chart.slices.map((x) => x.value),
        },
      ],
      {
        x: 0.5,
        y,
        w: 5,
        h: 3.2,
        chartColors: s.chart.slices.map((x) => hx(x.color)),
        showLegend: true,
        legendPos: 'r',
        legendColor: ink,
        dataLabelColor: ink,
      },
    )
  }

  if (s.table) {
    const header = s.table.columns.map((c) => ({
      text: c,
      options: { bold: true, color: hx(p.bg), fill: { color: hx(p.accent) } },
    }))
    const rows = s.table.rows.map((r) => r.map((cell) => ({ text: cell, options: { color: ink } })))
    slide.addTable([header, ...rows], {
      x: hasChart ? 6 : 0.5,
      y,
      w: hasChart ? 6.8 : 12.3,
      fontFace: 'Arial',
      fontSize: 9,
      border: { type: 'solid', color: hx(p.line), pt: 0.5 },
      autoPage: true,
    })
    if (s.table.caption) {
      slide.addText(s.table.caption, {
        x: hasChart ? 6 : 0.5,
        y: 6.7,
        w: 6.8,
        h: 0.3,
        fontSize: 9,
        italic: true,
        color: muted,
        fontFace: 'Arial',
      })
    }
  }

  if (s.notes?.length) {
    slide.addText(s.notes.join('\n'), {
      x: 0.5,
      y: 6.0,
      w: 5.3,
      h: 1.2,
      fontSize: 10,
      color: muted,
      fontFace: 'Arial',
    })
  }
}

/** Build a dual-theme PPTX deck from a render-ready ExportModel. Returns the .pptx bytes. */
export async function buildPptx(model: ExportModel, theme: ExportTheme): Promise<ArrayBuffer> {
  const p = theme === 'dark' ? DARK : LIGHT
  const bg = hx(p.bg)
  const ink = hx(p.ink)
  const muted = hx(p.muted)

  const pptx = new pptxgen()
  pptx.layout = 'LAYOUT_WIDE'

  // Title slide
  const title = pptx.addSlide()
  title.background = { color: bg }
  title.addText(model.title, {
    x: 0.6,
    y: 2.4,
    w: 12.1,
    h: 0.9,
    fontSize: 40,
    bold: true,
    color: ink,
    fontFace: 'Arial',
  })
  title.addText(`${model.customer} · ${model.subtitle}`, {
    x: 0.6,
    y: 3.4,
    w: 12.1,
    h: 0.5,
    fontSize: 16,
    color: muted,
    fontFace: 'Arial',
  })

  // Executive summary slide
  const exec = pptx.addSlide()
  exec.background = { color: bg }
  exec.addText(model.execTitle, {
    x: 0.5,
    y: 0.3,
    w: 12.3,
    h: 0.6,
    fontSize: 22,
    bold: true,
    color: ink,
    fontFace: 'Arial',
  })
  model.kpis.forEach((k, i) => {
    exec.addText(
      [
        {
          text: `${k.value}\n`,
          options: { bold: true, color: hx(toneHex(k.tone, p)), fontSize: 30 },
        },
        { text: k.label, options: { color: muted, fontSize: 12 } },
      ],
      { x: 0.5 + i * 3.15, y: 2, w: 3, h: 1.6, fontFace: 'Arial', valign: 'top' },
    )
  })

  for (const s of model.sections) addSection(pptx, s, p, bg)

  // Footer note on the title slide
  title.addText(model.footer, {
    x: 0.6,
    y: 7,
    w: 12.1,
    h: 0.3,
    fontSize: 9,
    color: muted,
    fontFace: 'Arial',
  })

  const out = await pptx.write({ outputType: 'arraybuffer' })
  return out as ArrayBuffer
}
