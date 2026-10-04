import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getMyListings } from '@/lib/api'
import type { Listing } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { KIND_LABELS, STATUS_LABELS, formatPrice } from '@/lib/listings'

export default function MyListings() {
  const { token } = useAuth()
  const location = useLocation()
  const saved = (location.state as { saved?: string; edited?: boolean } | null) ?? null
  const [items, setItems] = useState<Listing[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    let cancelled = false
    getMyListings(token)
      .then((r) => {
        if (!cancelled) setItems(r.listings)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load your listings. Try again.')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">My listings</h1>
        <Button asChild>
          <Link to="/listings/new">List your cattle</Link>
        </Button>
      </div>

      {saved?.saved && (
        <p role="status" className="mt-4 rounded-md border bg-muted px-4 py-3 text-sm">
          {saved.edited ? 'Saved' : 'Submitted'}: {saved.saved}. Our staff will look at it before it goes online.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {!items && !error && <p className="mt-6 text-sm text-muted-foreground">Loading...</p>}
      {items && items.length === 0 && (
        <p className="mt-6 text-muted-foreground">You have not listed any cattle yet.</p>
      )}

      <div className="mt-6 grid gap-3">
        {items?.map((l) => (
          <Card key={l.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <Link to={`/listings/${l.id}`} className="font-medium text-primary underline">
                  {l.name}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {KIND_LABELS[l.kind]} - {l.city}, {l.state} - {formatPrice(l)}
                </p>
                {l.status === 'rejected' && l.reviewNote && (
                  <p className="mt-1 text-sm text-destructive">Note from the reviewer: {l.reviewNote}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={l.status === 'rejected' ? 'destructive' : l.status === 'approved' ? 'default' : 'secondary'}>
                  {STATUS_LABELS[l.status]}
                </Badge>
                {l.status !== 'sold' && l.status !== 'withdrawn' && (
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/listings/${l.id}/edit`}>Edit</Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  )
}
