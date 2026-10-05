import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import CattleTabs from '@/components/CattleTabs'
import { Page } from '@/components/Page'
import { searchListings } from '@/lib/api'
import type { BreedingListing, CattleKind, FeederListing, ListingPage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { METHOD_LABELS, SALE_TYPE_LABELS, SEX_CLASS_LABELS, formatDate, formatPrice, placeText } from '@/lib/cattle'

type Any = FeederListing | BreedingListing

function FeederCard({ l }: { l: FeederListing }) {
  return (
    <>
      <Link to={`/feeder/${l.id}`} className="text-lg font-medium text-primary underline">
        {l.headline}
      </Link>
      <p className="text-sm text-muted-foreground">
        {l.breeds.join(', ')} - {l.headCount} head - {METHOD_LABELS[l.marketingMethod]} {formatDate(l.marketingDate)} - {placeText(l)}
        {l.distanceMiles != null ? ` (${l.distanceMiles} miles)` : ''}
      </p>
      {l.groupId && <p className="text-xs text-muted-foreground">Group {l.groupId}</p>}
    </>
  )
}

function BreedingCard({ l }: { l: BreedingListing }) {
  return (
    <>
      <Link to={`/breeding/${l.id}`} className="text-lg font-medium text-primary underline">
        {l.headline}
      </Link>
      <p className="text-sm text-muted-foreground">
        {SEX_CLASS_LABELS[l.sexClass]} - {l.breeds.join(', ')} - {SALE_TYPE_LABELS[l.saleType]} {formatDate(l.saleDate)} - {placeText(l)}
        {l.distanceMiles != null ? ` (${l.distanceMiles} miles)` : ''}
      </p>
      {(l.sire || l.dam) && (
        <p className="text-xs text-muted-foreground">
          {l.sire ? `Sire ${l.sire}` : ''}
          {l.sire && l.dam ? ' - ' : ''}
          {l.dam ? `Dam ${l.dam}` : ''}
        </p>
      )}
    </>
  )
}

export default function SearchCattle({ kind }: { kind: CattleKind }) {
  const { token, loading: authLoading } = useAuth()
  const [params, setParams] = useSearchParams()
  const [text, setText] = useState(params.get('q') ?? '')
  const [data, setData] = useState<ListingPage<Any> | null>(null)
  const [error, setError] = useState('')
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1)
  const q = params.get('q') ?? ''

  useEffect(() => setText(params.get('q') ?? ''), [params, kind])

  const load = useCallback(async () => {
    try {
      const r = await searchListings<Any>(kind, { q, page: page > 1 ? String(page) : undefined }, token)
      setData(r)
      setError('')
    } catch {
      setError('Could not load the listings. Try again.')
    }
  }, [kind, q, page, token])

  useEffect(() => {
    if (authLoading) return
    setData(null)
    void load()
  }, [load, authLoading])

  function submit(e: FormEvent) {
    e.preventDefault()
    const next = new URLSearchParams()
    if (text.trim()) next.set('q', text.trim())
    setParams(next)
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <Page>
      <h1 className="text-3xl font-semibold tracking-tight">Search For Cattle</h1>
      <div className="mt-4">
        <CattleTabs area="search" active={kind} />
      </div>

      <form onSubmit={submit} className="mt-6 flex flex-wrap items-end gap-3" role="search">
        <div className="grid w-full max-w-xl gap-1.5">
          <Label htmlFor="q">Search</Label>
          <Input id="q" value={text} onChange={(e) => setText(e.target.value)} placeholder="Breed, group, sire, auction, city..." />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {!data && !error && <p className="mt-6 text-sm text-muted-foreground">Loading...</p>}
      {data && data.listings.length === 0 && <p className="mt-6 text-muted-foreground">No cattle match that search.</p>}
      {data && data.total > 0 && <p className="mt-6 text-sm text-muted-foreground">{data.total} listing{data.total === 1 ? '' : 's'}</p>}

      <div className="mt-3 grid gap-3">
        {data?.listings.map((l) => (
          <Card key={l.id}>
            <CardContent className="grid gap-1 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>{kind === 'feeder' ? <FeederCard l={l as FeederListing} /> : <BreedingCard l={l as BreedingListing} />}</div>
              <p className="text-lg font-semibold">{formatPrice(l as FeederListing)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {data && pages > 1 && (
        <div className="mt-6 flex items-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.set('page', String(page - 1)); return n })}>
            Previous
          </Button>
          <span className="text-sm">
            Page {page} of {pages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.set('page', String(page + 1)); return n })}>
            Next
          </Button>
        </div>
      )}
    </Page>
  )
}
