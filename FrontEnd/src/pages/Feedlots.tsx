import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { getFeedlotStates, getFeedlotStats, listFeedlots } from '@/lib/api'
import type { FeedlotList, FeedlotQuery, FeedlotStats } from '@/lib/api'
import { useAuth } from '@/lib/auth'

export default function Feedlots() {
  const { user, token, loading: authLoading } = useAuth()
  const isStaff = user?.role === 'staff'
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [state, setState] = useState('')
  const [hasEmail, setHasEmail] = useState<FeedlotQuery['hasEmail']>('')
  const [show, setShow] = useState<FeedlotQuery['show']>('')
  const [page, setPage] = useState(1)
  const [states, setStates] = useState<{ state: string; n: number }[]>([])
  const [stats, setStats] = useState<FeedlotStats | null>(null)
  const [data, setData] = useState<FeedlotList | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (authLoading) return
    getFeedlotStates(token)
      .then((r) => setStates(r.states))
      .catch(() => setStates([]))
  }, [token, authLoading])

  useEffect(() => {
    if (authLoading || !isStaff || !token) {
      setStats(null)
      return
    }
    getFeedlotStats(token)
      .then((r) => setStats(r.stats))
      .catch(() => setStats(null))
  }, [authLoading, isStaff, token])

  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    setError('')
    listFeedlots({ q, state, hasEmail: user ? hasEmail : '', show: isStaff ? show : '', page }, token)
      .then((r) => {
        if (!cancelled) setData(r)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the feedlot list. Try again.')
      })
    return () => {
      cancelled = true
    }
  }, [q, state, hasEmail, show, page, token, authLoading, user, isStaff])

  function onSearch(e: FormEvent) {
    e.preventDefault()
    setPage(1)
    setQ(qInput.trim())
  }

  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Feedlots</h1>
          <p className="mt-2 text-muted-foreground">
            Feedlots and feeder buyers.
            {!user && ' Sign in to see phone numbers, emails and contacts.'}
          </p>
        </div>
        {isStaff && (
          <Button asChild>
            <Link to="/feedlots/new">Add feedlot</Link>
          </Button>
        )}
      </div>

      {isStaff && stats && (
        <p className="mt-3 text-sm text-muted-foreground" data-testid="feedlot-stats">
          {stats.total} feedlots - {stats.withEmail} with an email - {stats.canEmail} can be emailed - {stats.doNotEmail} do not email -{' '}
          {stats.withFax} with a fax number
        </p>
      )}

      <form onSubmit={onSearch} className="mt-6 grid gap-3 sm:grid-cols-[1fr_9rem_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="q">{user ? 'Search name, city or contact' : 'Search name or city'}</Label>
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
        <Button type="submit">Search</Button>
      </form>
      {user && (
        <div className="mt-3 flex flex-wrap gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Label htmlFor="hasEmail">Email</Label>
            <Select
              id="hasEmail"
              className="w-44"
              value={hasEmail}
              onChange={(e) => {
                setPage(1)
                setHasEmail(e.target.value as FeedlotQuery['hasEmail'])
              }}
            >
              <option value="">Any</option>
              <option value="1">Has an email</option>
              <option value="0">No email</option>
            </Select>
          </div>
          {isStaff && (
            <div className="flex items-center gap-2 text-sm">
              <Label htmlFor="show">Show</Label>
              <Select
                id="show"
                className="w-48"
                value={show}
                onChange={(e) => {
                  setPage(1)
                  setShow(e.target.value as FeedlotQuery['show'])
                }}
              >
                <option value="">All feedlots</option>
                <option value="active">Active only</option>
                <option value="retired">Retired only</option>
                <option value="dnm">Do not email</option>
              </Select>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-6 text-sm text-destructive">
          {error}
        </p>
      )}
      {!data && !error && <p className="mt-6 text-sm text-muted-foreground">Loading...</p>}

      {data && (
        <>
          <p className="mt-6 text-sm text-muted-foreground">
            {data.total === 0 ? 'No feedlots match.' : `${data.total} feedlot${data.total === 1 ? '' : 's'}`}
          </p>
          <div className="mt-2 grid gap-2">
            {data.feedlots.map((f) => (
              <Card key={f.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <Link to={`/feedlots/${f.id}`} className="font-medium text-primary hover:underline">
                      {f.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">{[f.city, f.state].filter(Boolean).join(', ')}</p>
                    {user && (
                      <p className="mt-1 text-sm">
                        {f.phone ? f.phone : 'No phone'} - {f.emails && f.emails.length > 0 ? f.emails.join(', ') : 'No email'}
                        {f.fax ? ` - Fax ${f.fax}` : ''}
                      </p>
                    )}
                  </div>
                  {isStaff && (
                    <div className="flex gap-2">
                      {f.enabled === false && <Badge variant="outline">Retired</Badge>}
                      {f.doNotEmail && <Badge variant="secondary">Do not email</Badge>}
                    </div>
                  )}
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
