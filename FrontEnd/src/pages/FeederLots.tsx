import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { listFeeders } from '@/lib/api'
import type { FeederList } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { SEX_LABELS, formatFeederPrice, weightText } from '@/lib/feeders'

export default function FeederLots() {
  const { user, token, loading: authLoading } = useAuth()
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [sex, setSex] = useState('')
  const [state, setState] = useState('')
  const [minInput, setMinInput] = useState('')
  const [maxInput, setMaxInput] = useState('')
  const [weights, setWeights] = useState({ min: '', max: '' })
  const [page, setPage] = useState(1)
  const [data, setData] = useState<FeederList | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    setError('')
    listFeeders({ q, sex, state, minWeight: weights.min, maxWeight: weights.max, page }, token)
      .then((r) => {
        if (!cancelled) setData(r)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the feeder lots. Try again.')
      })
    return () => {
      cancelled = true
    }
  }, [q, sex, state, weights, page, token, authLoading])

  function onSearch(e: FormEvent) {
    e.preventDefault()
    setPage(1)
    setQ(qInput.trim())
    setWeights({ min: minInput.trim(), max: maxInput.trim() })
  }

  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Red Angus feeder cattle for sale</h1>
        <Button asChild>
          <Link to={user ? '/feeders/new' : '/login'} state={user ? undefined : { from: '/feeders/new' }}>
            List a feeder lot
          </Link>
        </Button>
      </div>

      <form onSubmit={onSearch} className="mt-6 grid gap-3 sm:grid-cols-[1fr_9rem_5rem_6rem_6rem_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="q">Search title, breed, sire, city</Label>
          <Input id="q" value={qInput} onChange={(e) => setQInput(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sex">Sex</Label>
          <Select
            id="sex"
            value={sex}
            onChange={(e) => {
              setPage(1)
              setSex(e.target.value)
            }}
          >
            <option value="">All</option>
            {Object.entries(SEX_LABELS).map(([k, label]) => (
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
        <div className="grid gap-1.5">
          <Label htmlFor="minWeight">Min lb</Label>
          <Input id="minWeight" inputMode="numeric" value={minInput} onChange={(e) => setMinInput(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="maxWeight">Max lb</Label>
          <Input id="maxWeight" inputMode="numeric" value={maxInput} onChange={(e) => setMaxInput(e.target.value)} />
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
            {data.total === 0 ? 'No feeder lots match.' : `${data.total} lot${data.total === 1 ? '' : 's'}`}
          </p>
          <div className="mt-2 grid gap-2">
            {data.lots.map((l) => (
              <Card key={l.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <Link to={`/feeders/${l.id}`} className="font-medium text-primary hover:underline">
                      {l.title}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {l.headCount} head {SEX_LABELS[l.sex].toLowerCase()} - {weightText(l)} - {l.city}, {l.state}
                    </p>
                  </div>
                  <Badge variant="secondary">{formatFeederPrice(l)}</Badge>
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
