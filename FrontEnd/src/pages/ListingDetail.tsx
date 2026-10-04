import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ApiError, closeListing, getListing } from '@/lib/api'
import type { Listing } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { KIND_LABELS, STATUS_LABELS, formatDate, formatPrice } from '@/lib/listings'

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === '') return null
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  )
}

export default function ListingDetail() {
  const { id = '' } = useParams()
  const { user, token, loading: authLoading } = useAuth()
  const [listing, setListing] = useState<Listing | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await getListing(id, token)
      setListing(r.listing)
      setNotFound(false)
      setError('')
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true)
      else setError('Could not load this listing. Try again.')
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
      await closeListing(id, status, token)
      await load()
    } catch {
      setError('Could not update the listing. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (notFound) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Listing not found</h1>
        <p className="mt-2 text-muted-foreground">It may have been sold, withdrawn or not approved yet.</p>
        <p className="mt-2">
          <Link to="/listings" className="text-primary underline">
            Back to all cattle
          </Link>
        </p>
      </main>
    )
  }
  if (!listing) {
    return error ? (
      <p role="alert" className="px-6 py-16 text-center text-destructive">
        {error}
      </p>
    ) : (
      <p className="px-6 py-16 text-center text-sm text-muted-foreground">Loading...</p>
    )
  }

  const mine = listing.mine === true
  const canEdit = mine && listing.status !== 'sold' && listing.status !== 'withdrawn'

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <p className="text-sm">
        <Link to="/listings" className="text-primary underline">
          All cattle for sale
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{listing.name}</h1>
        {listing.status !== 'approved' && (
          <Badge variant={listing.status === 'rejected' ? 'destructive' : 'secondary'}>{STATUS_LABELS[listing.status]}</Badge>
        )}
      </div>
      <p className="mt-1 text-muted-foreground">
        {KIND_LABELS[listing.kind]} - {listing.city}, {listing.state}
      </p>
      <p className="mt-2 text-xl font-semibold">{formatPrice(listing)}</p>

      {mine && listing.reviewNote && (
        <Card className="mt-4 border-destructive">
          <CardContent className="py-3 text-sm">
            <span className="font-medium">Note from the reviewer:</span> {listing.reviewNote}
          </CardContent>
        </Card>
      )}

      {canEdit && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link to={`/listings/${listing.id}/edit`}>Edit</Link>
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
          <CardTitle>Animal</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-sm">
            <Row label="Registration number" value={listing.regNumber} />
            <Row label="Tag or tattoo" value={listing.tag} />
            <Row label="Born" value={formatDate(listing.birthDate)} />
            <Row label="Number of head" value={listing.headCount > 1 ? listing.headCount : null} />
            <Row label="Sire" value={[listing.sireName, listing.sireReg].filter(Boolean).join(' - ')} />
            <Row label="Dam" value={[listing.damName, listing.damReg].filter(Boolean).join(' - ')} />
            <Row label="Birth weight" value={listing.birthWeight ? `${listing.birthWeight} lb` : null} />
            <Row label="Weaning weight" value={listing.weaningWeight ? `${listing.weaningWeight} lb` : null} />
            <Row label="Yearling weight" value={listing.yearlingWeight ? `${listing.yearlingWeight} lb` : null} />
            <Row label="Scrotal circumference" value={listing.scrotal ? `${listing.scrotal} cm` : null} />
            <Row label="Bred to" value={listing.bredTo} />
            <Row label="Due" value={formatDate(listing.dueDate)} />
          </dl>
          {listing.description && <p className="mt-4 whitespace-pre-line text-sm">{listing.description}</p>}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Seller</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {user ? (
            <dl className="grid gap-2">
              <Row label="Contact" value={listing.contactName} />
              <Row label="Phone" value={listing.contactPhone} />
              <Row label="Email" value={listing.contactEmail} />
            </dl>
          ) : (
            <p>
              <Link to="/login" state={{ from: `/listings/${listing.id}` }} className="text-primary underline">
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
