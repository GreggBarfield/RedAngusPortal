import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ApiError, closeFeeder, getFeeder } from '@/lib/api'
import type { FeederLot } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { HORN_LABELS, SALE_LABELS, SEX_LABELS, formatFeederPrice, weightText } from '@/lib/feeders'
import { STATUS_LABELS, formatDate } from '@/lib/listings'

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === '') return null
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  )
}

export default function FeederDetail() {
  const { id = '' } = useParams()
  const { user, token, loading: authLoading } = useAuth()
  const [lot, setLot] = useState<FeederLot | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await getFeeder(id, token)
      setLot(r.lot)
      setNotFound(false)
      setError('')
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true)
      else setError('Could not load this lot. Try again.')
    }
  }, [id, token])

  useEffect(() => {
    if (authLoading) return
    void load()
  }, [load, authLoading])

  async function close(status: 'sold' | 'withdrawn') {
    if (!token) return
    setBusy(true)
    try {
      await closeFeeder(id, status, token)
      await load()
    } catch {
      setError('Could not update the lot. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (notFound) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Lot not found</h1>
        <p className="mt-2 text-muted-foreground">It may have been sold, withdrawn or not approved yet.</p>
        <p className="mt-2">
          <Link to="/feeders" className="text-primary underline">
            Back to all feeder cattle
          </Link>
        </p>
      </main>
    )
  }
  if (!lot) {
    return error ? (
      <p role="alert" className="px-6 py-16 text-center text-destructive">
        {error}
      </p>
    ) : (
      <p className="px-6 py-16 text-center text-sm text-muted-foreground">Loading...</p>
    )
  }

  const mine = lot.mine === true
  const canEdit = mine && lot.status !== 'sold' && lot.status !== 'withdrawn'
  const age = lot.ageMonths != null ? `${lot.ageMonths} months` : null
  const weaned = lot.weaned ? (lot.weanedDays != null ? `Yes, ${lot.weanedDays} days` : 'Yes') : null

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <p className="text-sm">
        <Link to="/feeders" className="text-primary underline">
          All feeder cattle for sale
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{lot.title}</h1>
        {lot.status !== 'approved' && (
          <Badge variant={lot.status === 'rejected' ? 'destructive' : 'secondary'}>{STATUS_LABELS[lot.status]}</Badge>
        )}
      </div>
      <p className="mt-1 text-muted-foreground">
        {lot.headCount} head {SEX_LABELS[lot.sex].toLowerCase()} - {lot.city}, {lot.state}
      </p>
      <p className="mt-2 text-xl font-semibold">{formatFeederPrice(lot)}</p>

      {mine && lot.reviewNote && (
        <Card className="mt-4 border-destructive">
          <CardContent className="py-3 text-sm">
            <span className="font-medium">Note from the reviewer:</span> {lot.reviewNote}
          </CardContent>
        </Card>
      )}

      {canEdit && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link to={`/feeders/${lot.id}/edit`}>Edit</Link>
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void close('sold')}>
            Mark sold
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void close('withdrawn')}>
            Withdraw
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>The cattle</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-sm">
            <Row label="Number of head" value={lot.headCount} />
            <Row label="Sex" value={SEX_LABELS[lot.sex]} />
            <Row label="Weight" value={weightText(lot)} />
            <Row label="Breed" value={lot.breed} />
            <Row label="Age" value={age} />
            <Row label="Weaned" value={weaned} />
            <Row label="Horns" value={lot.hornStatus ? HORN_LABELS[lot.hornStatus] : null} />
            <Row label="Bunk broke" value={lot.bunkBroke ? 'Yes' : null} />
            <Row label="Sired by" value={lot.siredBy} />
            <Row label="Sale type" value={lot.saleType ? SALE_LABELS[lot.saleType] : null} />
            <Row label="Available" value={formatDate(lot.availableDate)} />
          </dl>
          {lot.healthProgram && (
            <>
              <p className="mt-4 text-sm font-medium">Health program</p>
              <p className="whitespace-pre-line text-sm">{lot.healthProgram}</p>
            </>
          )}
          {lot.description && <p className="mt-4 whitespace-pre-line text-sm">{lot.description}</p>}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Seller</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {user ? (
            <dl className="grid gap-2">
              <Row label="Contact" value={lot.contactName} />
              <Row label="Phone" value={lot.contactPhone} />
              <Row label="Email" value={lot.contactEmail} />
            </dl>
          ) : (
            <p>
              <Link to="/login" state={{ from: `/feeders/${lot.id}` }} className="text-primary underline">
                Sign in
              </Link>{' '}
              to see the seller&apos;s phone and email.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
