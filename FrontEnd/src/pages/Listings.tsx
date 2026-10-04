import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { listListings } from '@/lib/api'
import type { ListingList } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { KIND_LABELS, formatPrice } from '@/lib/listings'

export default function Listings() {
  const { user, token, loading: authLoading } = useAuth()
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [state, setState] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ListingList | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    setError('')
    listListings({ q, kind, state, page }, token)
      .then((r) => {
        if (!cancelled) setData(r)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the listings. Try again.')
      })
    return () => {
      cancelled = true
    }
  }, [q, kind, state, page, token, authLoading])

  function onSearch(e: FormEvent) {
    e.preventDefault()
    setPage(1)
    setQ(qInput.trim())
  }

  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Red Angus cattle for sale</h1>
        <Button asChild>
          <Link to={user ? '/listings/new' : '/login'} state={user ? undefined : { from: '/listings/new' }}>
            List your cattle
          </Link>
        </Button>
      </div>

      <form onSubmit={onSearch} className="mt-6 grid gap-3 sm:grid-cols-[1fr_11rem_6rem_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="q">Search name, registration, sire, dam, city</Label>
          <Input id="q" value={qInput} onChange={(e) => setQInput(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="kind">Type</Label>
          <Select
            id="kind"
            value={kind}
            onChange={(e) => {
              setPage(1)
              setKind(e.target.value)
            }}
          >
            <option value="">All types</option>
            {Object.entries(KIND_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="state">State</Label>
          <Input
            id="state"
            maxLength={2}
            placeholder="TX"
            value={state}
            onChange={(e) => {
              setPage(1)
              setState(e.target.value.toUpperCase())
            }}
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {error && (
        <p role="alert" className="mt-6 text-sm text-destructive">
          {error}
        </p>
      )}
      {!data && !error && <p className="mt-6 text-sm text-muted-foreground">Loading...</p>}
      {data && (
        <>
          <p className="mt-6 text-sm text-muted-foreground">
            {data.total === 0 ? 'No listings match.' : `${data.total} listing${data.total === 1 ? '' : 's'}`}
          </p>
          <div className="mt-2 grid gap-2">
            {data.listings.map((l) => (
              <Card key={l.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <Link to={`/listings/${l.id}`} className="font-medium text-primary hover:underline">
                      {l.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {KIND_LABELS[l.kind]}
                      {l.headCount > 1 ? ` - ${l.headCount} head` : ''} - {l.city}, {l.state}
                    </p>
                    {l.regNumber && <p className="text-sm">Reg. {l.regNumber}</p>}
                  </div>
                  <Badge variant="secondary">{formatPrice(l)}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
          {lastPage > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {lastPage}
              </span>
              <Button variant="outline" size="sm" disabled={page >= lastPage} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </main>
  )
}
