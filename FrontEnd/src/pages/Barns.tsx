import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { getBarnStates, listBarns } from '@/lib/api'
import type { BarnList } from '@/lib/api'
import { useAuth } from '@/lib/auth'

export default function Barns() {
  const { user, token, loading: authLoading } = useAuth()
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [state, setState] = useState('')
  const [category, setCategory] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [states, setStates] = useState<{ state: string; n: number }[]>([])
  const [data, setData] = useState<BarnList | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getBarnStates()
      .then((r) => setStates(r.states))
      .catch(() => setStates([]))
  }, [])

  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    setError('')
    listBarns({ q, state, category, activeOnly, page }, token)
      .then((r) => {
        if (!cancelled) setData(r)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the barn list. Try again.')
      })
    return () => {
      cancelled = true
    }
  }, [q, state, category, activeOnly, page, token, authLoading])

  function onSearch(e: FormEvent) {
    e.preventDefault()
    setPage(1)
    setQ(qInput.trim())
  }

  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Sale barns</h1>
      <p className="mt-2 text-muted-foreground">
        Auction barns you can send listings to.
        {!user && ' Sign in to see fax numbers, emails and contacts.'}
      </p>

      <form onSubmit={onSearch} className="mt-6 grid gap-3 sm:grid-cols-[1fr_8rem_9rem_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="q">Search name or city</Label>
          <Input id="q" value={qInput} onChange={(e) => setQInput(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="state">State</Label>
          <Select
            id="state"
            value={state}
            onChange={(e) => {
              setPage(1)
              setState(e.target.value)
            }}
          >
            <option value="">All states</option>
            {states.map((s) => (
              <option key={s.state} value={s.state}>
                {s.state} ({s.n})
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="category">Kind</Label>
          <Select
            id="category"
            value={category}
            onChange={(e) => {
              setPage(1)
              setCategory(e.target.value)
            }}
          >
            <option value="">All</option>
            <option value="REG">Regular sale barns</option>
            <option value="VID">Video sales</option>
          </Select>
        </div>
        <Button type="submit">Search</Button>
      </form>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={activeOnly}
          onChange={(e) => {
            setPage(1)
            setActiveOnly(e.target.checked)
          }}
        />
        Only barns marked active
      </label>

      {error && (
        <p role="alert" className="mt-6 text-sm text-destructive">
          {error}
        </p>
      )}
      {!data && !error && <p className="mt-6 text-sm text-muted-foreground">Loading...</p>}

      {data && (
        <>
          <p className="mt-6 text-sm text-muted-foreground">
            {data.total === 0 ? 'No barns match.' : `${data.total} barn${data.total === 1 ? '' : 's'}`}
          </p>
          <div className="mt-2 grid gap-2">
            {data.barns.map((b) => (
              <Card key={b.auctionNo}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <Link to={`/barns/${b.auctionNo}`} className="font-medium text-primary hover:underline">
                      {b.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {[b.city, b.state].filter(Boolean).join(', ') || 'Location not listed'}
                    </p>
                    {user && (
                      <p className="mt-1 text-sm">
                        {b.fax ? `Fax ${b.fax}` : 'No fax'} - {b.email ? b.email : 'No email'}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {b.category === 'VID' && <Badge variant="secondary">Video sale</Badge>}
                    {!b.isActive && <Badge variant="outline">Not active</Badge>}
                  </div>
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
