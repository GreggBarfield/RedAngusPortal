import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { BarChart3, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { ApiError, getMarketInsights } from '@/lib/api'
import type { InsightMarket, InsightPriceRow, MarketInsightsBundle } from '@/lib/api'

const RADIUS = 200

function money(v: unknown) {
  const n = Number(v)
  return v == null || v === '' || !Number.isFinite(n) ? '-' : `$${n.toFixed(2)}`
}
function num(v: unknown) {
  const n = Number(v)
  return v == null || v === '' || !Number.isFinite(n) ? '-' : n.toLocaleString()
}
function dateOnly(v?: string | null) {
  if (!v) return '-'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString()
}

function PriceTable({ title, rows }: { title: string; rows?: InsightPriceRow[] }) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      {!rows || rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rows available.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-1 pr-3 font-medium">Weight</th>
              <th className="py-1 pr-3 font-medium">Avg $/cwt</th>
              <th className="py-1 pr-3 font-medium">Range $/cwt</th>
              <th className="py-1 font-medium">Head</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.weight_group}-${i}`} className="border-b last:border-0">
                <td className="py-1 pr-3">{r.weight_group}</td>
                <td className="py-1 pr-3">{money(r.avg_price_cwt)}</td>
                <td className="py-1 pr-3">
                  {money(r.low_price_cwt)} - {money(r.high_price_cwt)}
                </td>
                <td className="py-1">{num(r.total_head)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  )
}

function Report({ bundle, onPick }: { bundle: MarketInsightsBundle; onPick: (slug: string) => void }) {
  const markets: InsightMarket[] = bundle.markets ?? []
  const region = bundle.region ?? {}
  const sel = bundle.selected_market ?? null
  const summary = sel ? (sel.ai_summary || sel.narrative || '') : ''
  const lines = summary.split('\n').map((l) => l.trim()).filter(Boolean)
  return (
    <div className="grid gap-5">
      {markets.length > 0 && (
        <div className="grid max-w-xl gap-1.5">
          <Label htmlFor="lmi-market">Market</Label>
          <Select id="lmi-market" value={String(sel?.slug_id ?? '')} onChange={(e) => onPick(e.target.value)}>
            {markets.map((m) => (
              <option key={String(m.slug_id)} value={String(m.slug_id)}>
                {m.market_name} - {m.distance_miles} mi
              </option>
            ))}
          </Select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Markets found" value={num(region.markets_found)} />
        <Stat label="Nearest market" value={region.nearest_market || '-'} />
        <Stat label="Distance" value={`${region.nearest_market_distance_miles || '-'} mi`} />
        <Stat label="Reported lots head" value={num(region.total_head)} />
        <Stat label="Avg steer" value={`${money(region.avg_steer_price_cwt)}/cwt`} />
        <Stat label="Avg heifer" value={`${money(region.avg_heifer_price_cwt)}/cwt`} />
      </div>
      {sel && (
        <div className="grid gap-3">
          <div>
            <h3 className="text-lg font-semibold">{sel.market_name}</h3>
            <p className="text-sm text-muted-foreground">
              {[sel.city, sel.state].filter(Boolean).join(', ')} - Report date: {dateOnly(sel.report_date)} - {sel.distance_miles} mi away
            </p>
          </div>
          {sel.pricing_note && <p className="text-xs text-muted-foreground">{sel.pricing_note}</p>}
          <div className="grid gap-2 text-sm">
            {lines.length === 0 ? <p className="text-muted-foreground">No AI market summary available for this market.</p> : lines.map((l, i) => <p key={i}>{l}</p>)}
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <PriceTable title="Steers" rows={sel.steers} />
            <PriceTable title="Heifers" rows={sel.heifers} />
          </div>
        </div>
      )}
    </div>
  )
}

function Modal({ initialZip, onClose }: { initialZip: string; onClose: () => void }) {
  const [zipText, setZipText] = useState(initialZip)
  const [zip, setZip] = useState(/^\d{5}$/.test(initialZip) ? initialZip : '')
  const [bundle, setBundle] = useState<MarketInsightsBundle | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const latest = useRef(0)

  const load = useCallback(async (z: string, slug?: string) => {
    const mine = ++latest.current
    setLoading(true)
    setError('')
    try {
      const b = await getMarketInsights(z, RADIUS, slug)
      if (mine === latest.current) setBundle(b)
    } catch (err) {
      if (mine !== latest.current) return
      setBundle(null)
      const msg = err instanceof ApiError ? (err.code.includes(' ') ? err.code : '') : err instanceof Error ? err.message : ''
      setError(msg || 'Unable to load market insights.')
    } finally {
      if (mine === latest.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (zip) void load(zip)
  }, [zip, load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!/^\d{5}$/.test(zipText)) return setError('Enter a 5-digit zip code.')
    if (zipText === zip) void load(zip)
    else setZip(zipText)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="lmi-title" className="relative w-full max-w-5xl rounded-lg border bg-card p-6 shadow-lg">
        <button type="button" aria-label="Close" onClick={onClose} className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-accent">
          <X className="h-5 w-5" />
        </button>
        <h2 id="lmi-title" className="text-xl font-semibold tracking-tight">
          Local Market Insights
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">Recent USDA sale barn reports for markets within {RADIUS} miles of your zip code.</p>
        <form onSubmit={submit} className="mb-5 flex items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="lmi-zip">Zip code</Label>
            <Input id="lmi-zip" className="w-36" inputMode="numeric" maxLength={5} value={zipText} onChange={(e) => setZipText(e.target.value.replace(/\D/g, '').slice(0, 5))} />
          </div>
          <Button type="submit" variant="outline">
            Show markets
          </Button>
        </form>
        {loading && <p className="text-sm text-muted-foreground">Loading market insights...</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {!loading && !error && !bundle && <p className="text-sm text-muted-foreground">Enter your zip code to see nearby markets.</p>}
        {!loading && bundle && <Report bundle={bundle} onPick={(slug) => void load(zip, slug)} />}
      </div>
    </div>
  )
}

// Button that opens the Local Market Insights window. The zip can be blank; the window asks for it.
export default function MarketInsightsButton({ zip = '', className }: { zip?: string | null; className?: string }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <>
      <Button type="button" variant="outline" className={className} onClick={() => setOpen(true)}>
        <BarChart3 className="h-4 w-4" />
        Market Insights
      </Button>
      {open && <Modal initialZip={zip ?? ''} onClose={close} />}
    </>
  )
}
