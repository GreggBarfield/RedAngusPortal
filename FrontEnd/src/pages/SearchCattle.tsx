import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import CattleTabs from '@/components/CattleTabs'
import ListingPanel from '@/components/ListingPanel'
import { Page } from '@/components/Page'
import SavedFilters from '@/components/SavedFilters'
import SearchFilters from '@/components/SearchFilters'
import { ApiError, searchListings } from '@/lib/api'
import type { BreedingListing, CattleKind, FeederListing, ListingPage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { METHOD_LABELS, breedText, SALE_TYPE_LABELS, SEX_CLASS_LABELS, formatDate, formatPrice, placeText } from '@/lib/cattle'
import { SORT_OPTIONS, hasFilters, sortValue, toApi, withSort } from '@/lib/searchFilters'
import { cn } from '@/lib/utils'

type Any = FeederListing | BreedingListing

function FeederCard({ l }: { l: FeederListing }) {
  return (
    <>
      <Link to={`/feeder/${l.id}`} className="text-lg font-medium text-primary underline">
        {l.headline}
      </Link>
      <p className="text-sm text-muted-foreground">
        {breedText(l)} - {l.headCount} head - {METHOD_LABELS[l.marketingMethod]} {formatDate(l.marketingDate)} - {placeText(l)}
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1)
  const query = params.toString()

  useEffect(() => setText(params.get('q') ?? ''), [params, kind])

  const load = useCallback(async () => {
    try {
      const r = await searchListings<Any>(kind, toApi(kind, new URLSearchParams(query), page), token)
      setData(r)
      setError('')
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && Object.keys(err.fields).length > 0) setError(Object.values(err.fields).join(' '))
      else setError('Could not load the listings. Try again.')
    }
  }, [kind, query, page, token])

  useEffect(() => {
    if (authLoading) return
    setData(null)
    setSelectedId(null)
    void load()
  }, [load, authLoading])

  function go(next: URLSearchParams) {
    setParams(next)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const next = new URLSearchParams(params)
    next.delete('page')
    if (text.trim()) next.set('q', text.trim())
    else next.delete('q')
    go(next)
  }

  function toPage(n: number) {
    const next = new URLSearchParams(params)
    if (n > 1) next.set('page', String(n))
    else next.delete('page')
    go(next)
    window.scrollTo?.({ top: 0 })
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const sort = sortValue(params)
  const hasCenter = !!params.get('zip') && !!params.get('miles')
  const anything = params.has('q') || hasFilters(kind, params)
  const selected = data ? data.listings.find((l) => l.id === selectedId) ?? data.listings[0] ?? null : null

  return (
    <Page>
      <h1 className="text-3xl font-semibold tracking-tight">Search For Cattle</h1>
      <div className="mt-4">
        <CattleTabs area="search" active={kind} />
      </div>

      <div className="mt-6 grid gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <form onSubmit={submit} className="flex min-w-full flex-1 items-end gap-3 sm:min-w-0" role="search">
            <div className="grid w-full min-w-0 max-w-3xl flex-1 gap-1.5">
              <Label htmlFor="q">Search</Label>
              <Input id="q" value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'feeder' ? 'Breed, group, program, auction, city...' : 'Breed, registration, sire, dam, auction, city...'} />
            </div>
            <Button type="submit">Search</Button>
          </form>
          <SavedFilters kind={kind} token={token} params={params} canSave={anything} onApply={go} />
        </div>

        <SearchFilters kind={kind} params={params} onChange={go} />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {data ? (data.total > 0 ? `${data.total} listing${data.total === 1 ? '' : 's'}` : '') : ''}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {anything && (
            <Button type="button" variant="ghost" size="sm" onClick={() => go(new URLSearchParams())}>
              Clear all filters
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Label htmlFor="sort" className="text-sm">
              Sort by
            </Label>
            <Select id="sort" className="w-56" value={sort} onChange={(e) => go(withSort(params, e.target.value))}>
              {SORT_OPTIONS[kind].map(([v, label]) => (
                <option key={v} value={v} disabled={v === 'distance:asc' && !hasCenter}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {!data && !error && <p className="mt-6 text-sm text-muted-foreground">Loading...</p>}
      {data && data.listings.length === 0 && <p className="mt-6 text-muted-foreground">No cattle match that search.</p>}

      {data && data.listings.length > 0 && (
        <div className="mt-4 grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="grid gap-3">
            {data.listings.map((l) => {
              const on = selected?.id === l.id
              return (
                <article
                  key={l.id}
                  aria-current={on ? 'true' : undefined}
                  onClick={() => setSelectedId(l.id)}
                  className={cn('grid cursor-pointer gap-1 rounded-lg border bg-card px-5 py-4 shadow-sm sm:grid-cols-[1fr_auto] sm:items-center', on && 'border-primary ring-1 ring-primary')}
                >
                  <div>{kind === 'feeder' ? <FeederCard l={l as FeederListing} /> : <BreedingCard l={l as BreedingListing} />}</div>
                  <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                    <p className="text-lg font-semibold">{formatPrice(l as FeederListing)}</p>
                    <Button type="button" size="sm" variant={on ? 'secondary' : 'outline'} className="hidden lg:inline-flex" aria-pressed={on} onClick={() => setSelectedId(l.id)}>
                      {on ? 'Showing' : 'Preview'}
                    </Button>
                  </div>
                </article>
              )
            })}

            {pages > 1 && (
              <div className="mt-2 flex items-center gap-3">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => toPage(page - 1)}>
                  Previous
                </Button>
                <span className="text-sm">
                  Page {page} of {pages}
                </span>
                <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => toPage(page + 1)}>
                  Next
                </Button>
              </div>
            )}
          </div>

          <div className="hidden lg:sticky lg:top-4 lg:block">
            <ListingPanel kind={kind} listing={selected} signedIn={!!token} />
          </div>
        </div>
      )}
    </Page>
  )
}
