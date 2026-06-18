import pptxgen from 'pptxgenjs'
import { DARK, LIGHT, type Palette } from '../../../theme/palette'
import { toneHex } from '../tone'
import type {
  DeckBar,
  DeckDonut,
  DeckSection,
  DeckStack,
  ExportModel,
  ExportSection,
  ExportTheme,
} from '../types'
import { planSlides } from './slidePlan'

type Slide = ReturnType<pptxgen['addSlide']>

const hx = (c: string) => c.replace('#', '')
const FONT = 'Arial'

// LAYOUT_WIDE canvas
const SLIDE_W = 13.333
const M = 0.5
const CONTENT_W = SLIDE_W - 2 * M // 12.333

// Band geometry
const BAND_TOP = 0.35
const BAND_H = 3.35
const DIVIDER_Y = 3.8
const BAND_BOTTOM = 3.95
const LABEL_W = 2.3
const CHART_X = M + LABEL_W + 0.35 // 3.15
const CHART_W = SLIDE_W - M - CHART_X // ~9.68

function kpiCard(
  slide: Slide,
  x: number,
  y: number,
  w: number,
  h: number,
  value: string,
  label: string,
  color: string,
  p: Palette,
  valueSize = 20,
) {
  slide.addShape('roundRect' as pptxgen.SHAPE_NAME, {
    x,
    y,
    w,
    h,
    rectRadius: 0.08,
    fill: { color: hx(p.surface) },
    line: { color: hx(p.line), width: 1 },
  })
  slide.addText(
    [
      { text: `${value}\n`, options: { bold: true, color: hx(color), fontSize: valueSize } },
      { text: label, options: { color: hx(p.muted), fontSize: 10 } },
    ],
    { x: x + 0.14, y, w: w - 0.28, h, valign: 'middle', align: 'left', fontFace: FONT },
  )
}

function drawBars(
  slide: Slide,
  x: number,
  y: number,
  w: number,
  h: number,
  data: DeckBar[],
  p: Palette,
) {
  if (data.length === 0) return
  const rowH = h / data.length
  const labelW = 1.7
  const valueW = 1.0
  const trackX = x + labelW
  const trackW = w - labelW - valueW - 0.15
  const barH = Math.min(0.28, rowH * 0.5)
  data.forEach((b, i) => {
    const top = y + i * rowH
    slide.addText(b.label, {
      x,
      y: top,
      w: labelW - 0.1,
      h: rowH,
      valign: 'middle',
      align: 'left',
      fontSize: 11,
      color: hx(p.muted),
      fontFace: FONT,
    })
    const ty = top + (rowH - barH) / 2
    slide.addShape('roundRect' as pptxgen.SHAPE_NAME, {
      x: trackX,
      y: ty,
      w: trackW,
      h: barH,
      rectRadius: 0.04,
      fill: { color: hx(p.line) },
    })
    const fw = Math.max(0.04, trackW * Math.max(0, Math.min(1, b.ratio)))
    slide.addShape('roundRect' as pptxgen.SHAPE_NAME, {
      x: trackX,
      y: ty,
      w: fw,
      h: barH,
      rectRadius: 0.04,
      fill: { color: hx(b.color) },
    })
    slide.addText(b.value, {
      x: trackX + trackW + 0.1,
      y: top,
      w: valueW,
      h: rowH,
      valign: 'middle',
      align: 'right',
      fontSize: 11,
      bold: true,
      color: hx(p.ink),
      fontFace: FONT,
    })
  })
}

function drawDonut(slide: Slide, x: number, y: number, d: number, donut: DeckDonut, p: Palette) {
  slide.addChart(
    'doughnut',
    [
      {
        name: 'c',
        labels: donut.slices.map((_, i) => String(i)),
        values: donut.slices.map((s) => s.value),
      },
    ],
    {
      x,
      y,
      w: d,
      h: d,
      holeSize: 62,
      chartColors: donut.slices.map((s) => hx(s.color)),
      showLegend: false,
      showTitle: false,
      showValue: false,
      showPercent: false,
      dataBorder: { pt: 1, color: hx(p.bg) },
    },
  )
  slide.addText(donut.center, {
    x,
    y,
    w: d,
    h: d,
    align: 'center',
    valign: 'middle',
    fontSize: 15,
    bold: true,
    color: hx(p.ink),
    fontFace: FONT,
  })
}

function drawSection(slide: Slide, sec: ExportSection, top: number, p: Palette) {
  const d: DeckSection | undefined = sec.deck
  slide.addText(sec.title, {
    x: M,
    y: top + 0.12,
    w: LABEL_W + 1.2,
    h: 0.4,
    fontSize: 16,
    bold: true,
    color: hx(p.ink),
    fontFace: FONT,
  })
  if (d?.subtitle) {
    slide.addText(d.subtitle, {
      x: M,
      y: top + 0.58,
      w: LABEL_W,
      h: 0.6,
      fontSize: 9,
      color: hx(p.muted),
      valign: 'top',
      fontFace: FONT,
    })
  }
  if (d?.donut) {
    drawDonut(slide, M + 0.3, top + 1.15, 1.5, d.donut, p)
  } else if (d?.kpiChips?.length) {
    d.kpiChips.slice(0, 2).forEach((k, i) => {
      kpiCard(
        slide,
        M,
        top + 0.95 + i * 0.95,
        LABEL_W,
        0.82,
        k.value,
        k.label,
        toneHex(k.tone, p),
        p,
      )
    })
  }
  if (d?.bars?.length) {
    drawBars(slide, CHART_X, top + 0.7, CHART_W, BAND_H - 1.0, d.bars, p)
  }
  if (d?.caveat) {
    slide.addText(d.caveat, {
      x: CHART_X,
      y: top + BAND_H - 0.3,
      w: CHART_W,
      h: 0.28,
      fontSize: 8,
      italic: true,
      color: hx(p.muted),
      fontFace: FONT,
    })
  }
}

function drawTiles(slide: Slide, x: number, y: number, w: number, items: string[], p: Palette) {
  const cols = 4
  const rows = Math.ceil(items.length / cols)
  const gap = 0.18
  const tw = (w - gap * (cols - 1)) / cols
  const th = Math.min(0.7, (5.0 - gap * (rows - 1)) / Math.max(rows, 1))
  items.forEach((name, i) => {
    const c = i % cols
    const r = Math.floor(i / cols)
    slide.addText(name, {
      x: x + c * (tw + gap),
      y: y + r * (th + gap),
      w: tw,
      h: th,
      shape: 'roundRect' as pptxgen.SHAPE_NAME,
      rectRadius: 0.06,
      fill: { color: hx(p.surface) },
      line: { color: hx(p.accent), width: 1 },
      align: 'left',
      valign: 'middle',
      fontSize: 11,
      bold: true,
      color: hx(p.ink),
      fontFace: FONT,
      margin: 8,
    })
  })
}

function drawIdle(slide: Slide, sec: ExportSection, p: Palette) {
  slide.addText(sec.title, {
    x: M,
    y: 0.4,
    w: CONTENT_W,
    h: 0.6,
    fontSize: 24,
    bold: true,
    color: hx(p.ink),
    fontFace: FONT,
  })
  if (sec.deck?.subtitle) {
    slide.addText(sec.deck.subtitle, {
      x: M,
      y: 1.0,
      w: CONTENT_W,
      h: 0.4,
      fontSize: 13,
      color: hx(p.muted),
      fontFace: FONT,
    })
  }
  if (sec.deck?.tiles?.length) drawTiles(slide, M, 1.7, CONTENT_W, sec.deck.tiles, p)
}

function drawExec(slide: Slide, model: ExportModel, p: Palette) {
  slide.addText(model.execTitle, {
    x: M,
    y: 0.4,
    w: CONTENT_W,
    h: 0.6,
    fontSize: 24,
    bold: true,
    color: hx(p.ink),
    fontFace: FONT,
  })
  const cardW = (CONTENT_W - 3 * 0.3) / 4
  model.kpis.slice(0, 4).forEach((k, i) => {
    kpiCard(
      slide,
      M + i * (cardW + 0.3),
      1.4,
      cardW,
      1.6,
      k.value,
      k.label,
      toneHex(k.tone, p),
      p,
      30,
    )
  })
  const posture: DeckStack | undefined = model.posture
  if (posture) {
    let cx = M
    const barY = 4.3
    posture.segments.forEach((seg) => {
      const sw = CONTENT_W * Math.max(0, Math.min(1, seg.ratio))
      slide.addShape('rect' as pptxgen.SHAPE_NAME, {
        x: cx,
        y: barY,
        w: Math.max(0.02, sw),
        h: 0.55,
        fill: { color: hx(seg.color) },
      })
      cx += sw
    })
    let lx = M
    posture.segments.forEach((seg) => {
      slide.addShape('rect' as pptxgen.SHAPE_NAME, {
        x: lx,
        y: 5.15,
        w: 0.16,
        h: 0.16,
        fill: { color: hx(seg.color) },
      })
      slide.addText(`${seg.label}: ${seg.value}`, {
        x: lx + 0.24,
        y: 5.06,
        w: 3.2,
        h: 0.32,
        fontSize: 11,
        color: hx(p.muted),
        fontFace: FONT,
      })
      lx += 3.5
    })
  }
}

/** Build a dual-theme, two-band PPTX deck from a render-ready ExportModel. Returns the .pptx bytes. */
export async function buildPptx(model: ExportModel, theme: ExportTheme): Promise<ArrayBuffer> {
  const p: Palette = theme === 'dark' ? DARK : LIGHT
  const bg = hx(p.bg)

  const pptx = new pptxgen()
  pptx.layout = 'LAYOUT_WIDE'

  // Title slide
  const title = pptx.addSlide()
  title.background = { color: bg }
  title.addShape('rect' as pptxgen.SHAPE_NAME, {
    x: M,
    y: 2.15,
    w: 1.2,
    h: 0.12,
    fill: { color: hx(p.accent) },
  })
  title.addText(model.title, {
    x: M,
    y: 2.45,
    w: CONTENT_W,
    h: 1.0,
    fontSize: 40,
    bold: true,
    color: hx(p.ink),
    fontFace: FONT,
  })
  title.addText(`${model.customer} · ${model.subtitle}`, {
    x: M,
    y: 3.5,
    w: CONTENT_W,
    h: 0.5,
    fontSize: 16,
    color: hx(p.muted),
    fontFace: FONT,
  })
  title.addText(model.footer, {
    x: M,
    y: 7.0,
    w: CONTENT_W,
    h: 0.3,
    fontSize: 9,
    color: hx(p.muted),
    fontFace: FONT,
  })

  // Executive summary (full-width single)
  const exec = pptx.addSlide()
  exec.background = { color: bg }
  drawExec(exec, model, p)

  // Section slides via the pairing plan
  for (const item of planSlides(model.sections)) {
    const slide = pptx.addSlide()
    slide.background = { color: bg }
    if (item.kind === 'single') {
      drawIdle(slide, item.section, p)
    } else {
      drawSection(slide, item.top, BAND_TOP, p)
      slide.addShape('line' as pptxgen.SHAPE_NAME, {
        x: M,
        y: DIVIDER_Y,
        w: CONTENT_W,
        h: 0,
        line: { color: hx(p.line), width: 1 },
      })
      if (item.bottom) drawSection(slide, item.bottom, BAND_BOTTOM, p)
    }
  }

  const out = await pptx.write({ outputType: 'arraybuffer' })
  return out as ArrayBuffer
}
