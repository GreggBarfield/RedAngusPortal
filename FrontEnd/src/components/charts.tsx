import { useState } from 'react'
import type { ReactNode } from 'react'

// Small hand-made charts for the staff dashboard (no chart library).
// Colors: blue / orange are the first two slots of a checked color-blind-safe set; gray is "none".
export const CHART_COLORS = { blue: '#2a78d6', orange: '#eb6834', gray: '#b9b5ad' }

const INK = '#1a2133'
const INK_SOFT = '#52514e'
const GRID = '#e4e0d8'

export interface Series {
  key: string
  name: string
  color: string
}

export function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: INK_SOFT }}>
      {series.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} />
          {s.name}
        </li>
      ))}
    </ul>
  )
}

export function ChartCard({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-4 sm:p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {note && <p className="mb-3 text-sm text-muted-foreground">{note}</p>}
      {!note && <div className="mb-3" />}
      {children}
    </section>
  )
}

// The same numbers as a plain table, for anyone who cannot read the colors.
export function DataTable({ head, rows, label }: { head: string[]; rows: (string | number)[][]; label: string }) {
  return (
    <details className="mt-3 text-xs" style={{ color: INK_SOFT }}>
      <summary className="cursor-pointer select-none">{label}</summary>
      <table className="mt-2 w-full text-left">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="py-1 pr-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              {r.map((c, j) => (
                <td key={j} className="py-1 pr-3">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

export interface BarRow {
  label: string
  segments: { key: string; value: number; color: string; name: string }[]
}

// Horizontal bars. One segment per row = a plain bar; several = a stacked bar with 2px gaps.
// The row total is written at the tip of the bar.
export function HBars({ rows, empty = 'Nothing to show yet.' }: { rows: BarRow[]; empty?: string }) {
  const totals = rows.map((r) => r.segments.reduce((s, x) => s + x.value, 0))
  const max = Math.max(0, ...totals)
  if (rows.length === 0 || max === 0) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="grid gap-2">
      {rows.map((r, i) => {
        const shown = r.segments.filter((s) => s.value > 0)
        const text = `${r.label}: ${r.segments.map((s) => `${s.name} ${s.value}`).join(', ')}`
        return (
          <li key={r.label} aria-label={text} className="grid grid-cols-[6.5rem_1fr] items-center gap-3 text-sm">
            <span className="truncate" style={{ color: INK_SOFT }} title={r.label}>
              {r.label}
            </span>
            <span className="flex items-center gap-2">
              <span className="flex h-4 items-stretch gap-[2px]" style={{ width: `${Math.max(2, (totals[i] / max) * 88)}%` }}>
                {shown.map((s, k) => (
                  <span
                    key={s.key}
                    title={`${s.name}: ${s.value.toLocaleString()}`}
                    className={k === shown.length - 1 ? 'rounded-r-[4px]' : ''}
                    style={{ background: s.color, flexGrow: s.value, flexBasis: 0, minWidth: 2 }}
                  />
                ))}
              </span>
              <span className="tabular-nums font-medium" style={{ color: INK }}>
                {totals[i].toLocaleString()}
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// Round the top of the scale up to a clean number (4, 5, 10, 20, 50, 100 ...).
export function niceMax(m: number): number {
  if (m <= 4) return 4
  const pow = 10 ** Math.floor(Math.log10(m))
  for (const f of [1, 2, 5, 10]) if (m <= f * pow) return f * pow
  return 10 * pow
}

function topRounded(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h, w / 2)
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`
}

export interface ColumnGroup {
  label: string
  values: { key: string; value: number }[]
}

// Stacked columns over time. Hover or Tab to a column to read its numbers underneath.
export function StackedColumns({ groups, series, ariaLabel }: { groups: ColumnGroup[]; series: Series[]; ariaLabel: string }) {
  const [active, setActive] = useState<number | null>(null)
  const W = 640
  const H = 230
  const left = 34
  const right = 8
  const top = 12
  const bottom = 28
  const plotW = W - left - right
  const plotH = H - top - bottom
  const totals = groups.map((g) => g.values.reduce((s, v) => s + v.value, 0))
  const maxV = niceMax(Math.max(0, ...totals))
  const band = plotW / Math.max(1, groups.length)
  const barW = Math.min(24, band - 8)
  const y = (v: number) => top + plotH - (v / maxV) * plotH
  const ticks = [0, maxV / 2, maxV]
  const cur = active == null ? null : groups[active]

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="h-auto w-full">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={left - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill={INK_SOFT}>
              {t}
            </text>
          </g>
        ))}
        {groups.map((g, i) => {
          const cx = left + band * i + band / 2
          const x = cx - barW / 2
          let acc = 0
          const parts = series
            .map((s) => ({ s, v: g.values.find((v) => v.key === s.key)?.value ?? 0 }))
            .filter((p) => p.v > 0)
          return (
            <g key={g.label}>
              {parts.map((p, k) => {
                const y1 = y(acc + p.v)
                const y0 = y(acc)
                acc += p.v
                const last = k === parts.length - 1
                // 2px gap in the surface color between touching segments
                const h = Math.max(1, y0 - y1 - (k > 0 ? 2 : 0))
                const yy = y1
                return last ? (
                  <path key={p.s.key} d={topRounded(x, yy, barW, h, 4)} fill={p.s.color} />
                ) : (
                  <rect key={p.s.key} x={x} y={yy} width={barW} height={h} fill={p.s.color} />
                )
              })}
              <text x={cx} y={H - 10} textAnchor="middle" fontSize="10" fill={INK_SOFT}>
                {g.label}
              </text>
              <rect
                x={left + band * i}
                y={top}
                width={band}
                height={plotH + bottom}
                fill={active === i ? 'rgba(26,33,51,0.06)' : 'transparent'}
                tabIndex={0}
                aria-label={`${g.label}: ${g.values.map((v) => `${series.find((s) => s.key === v.key)?.name ?? v.key} ${v.value}`).join(', ')}`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              />
            </g>
          )
        })}
        <line x1={left} x2={W - right} y1={y(0)} y2={y(0)} stroke={INK_SOFT} strokeWidth={1} />
      </svg>
      <p className="min-h-5 text-sm" style={{ color: INK }} aria-live="polite">
        {cur ? (
          <>
            <span className="font-medium">Week of {cur.label}:</span>{' '}
            {series.map((s) => `${cur.values.find((v) => v.key === s.key)?.value ?? 0} ${s.name.toLowerCase()}`).join(', ')}
          </>
        ) : (
          <span className="text-muted-foreground">Point at a week to see its numbers.</span>
        )}
      </p>
    </div>
  )
}
