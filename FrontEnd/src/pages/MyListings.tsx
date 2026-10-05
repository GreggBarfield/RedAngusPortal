import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CoverThumb } from '@/components/Media'
import { Page } from '@/components/Page'
import { getMyCattleListings } from '@/lib/api'
import type { BreedingListing, CattleKind, FeederListing } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { STATUS_LABELS, formatPrice, placeText } from '@/lib/cattle'

type Any = FeederListing | BreedingListing

function Group({ kind, title, items }: { kind: CattleKind; title: string; items: Any[] }) {
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        <Button asChild size="sm" variant="outline">
          <Link to={`/list/${kind}`}>List {kind === 'feeder' ? 'feeder cattle' : 'breeding cattle'}</Link>
        </Button>
      </div>
      {items.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Nothing listed yet.</p>}
      <div className="mt-3 grid gap-3">
        {items.map((l) => (
          <Card key={l.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="flex items-center gap-4">
                <CoverThumb photos={l.photos} />
                <div>
                  <Link to={`/${kind}/${l.id}`} className="font-medium text-primary underline">
                    {l.headline}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {placeText(l)} - {formatPrice(l as FeederListing)}
                  </p>
                  {l.status === 'rejected' && l.reviewNote && <p className="mt-1 text-sm text-destructive">Note from the reviewer: {l.reviewNote}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={l.status === 'rejected' ? 'destructive' : l.status === 'approved' ? 'default' : 'secondary'}>{STATUS_LABELS[l.status]}</Badge>
                {l.status !== 'sold' && l.status !== 'withdrawn' && (
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/list/${kind}/${l.id}/edit`}>Edit</Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}

export default function MyListings() {
  const { token } = useAuth()
  const location = useLocation()
  const saved = (location.state as { saved?: string; edited?: boolean } | null) ?? null
  const [feeder, setFeeder] = useState<Any[] | null>(null)
  const [breeding, setBreeding] = useState<Any[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    let cancelled = false
    Promise.all([getMyCattleListings<FeederListing>('feeder', token), getMyCattleListings<BreedingListing>('breeding', token)])
      .then(([a, b]) => {
        if (cancelled) return
        setFeeder(a.listings)
        setBreeding(b.listings)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load your listings. Try again.')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <Page>
      <h1 className="text-3xl font-semibold tracking-tight">My listings</h1>
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
      {(!feeder || !breeding) && !error && <p className="mt-6 text-sm text-muted-foreground">Loading...</p>}
      {feeder && breeding && (
        <>
          <Group kind="feeder" title="Feeder cattle" items={feeder} />
          <Group kind="breeding" title="Breeding cattle" items={breeding} />
        </>
      )}
    </Page>
  )
}
