import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { DocumentList, PhotoStrip, hasDocuments } from '@/components/Media'
import { Page } from '@/components/Page'
import { ApiError, getCattleQueue, reviewCattleListing } from '@/lib/api'
import type { BreedingListing, CattleKind, FeederListing } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { METHOD_LABELS, SALE_TYPE_LABELS, SEX_CLASS_LABELS, formatDate, formatPrice, placeText } from '@/lib/cattle'
import { cn } from '@/lib/utils'

type Status = 'pending' | 'approved' | 'rejected'
type Any = FeederListing | BreedingListing
const STATUS_TABS: Record<Status, string> = { pending: 'Waiting', approved: 'Live', rejected: 'Not approved' }

function Summary({ kind, l }: { kind: CattleKind; l: Any }) {
  if (kind === 'feeder') {
    const f = l as FeederListing
    return (
      <p className="text-sm text-muted-foreground">
        {f.breeds.join(', ')} - {METHOD_LABELS[f.marketingMethod]} {formatDate(f.marketingDate)} - {placeText(f)} - {formatPrice(f)}
      </p>
    )
  }
  const b = l as BreedingListing
  return (
    <p className="text-sm text-muted-foreground">
      {SEX_CLASS_LABELS[b.sexClass]} - {b.breeds.join(', ')} - {SALE_TYPE_LABELS[b.saleType]} {formatDate(b.saleDate)} - {placeText(b)} - {formatPrice(b)}
    </p>
  )
}

export default function StaffReview() {
  const { user, token } = useAuth()
  const [kind, setKind] = useState<CattleKind>('feeder')
  const [status, setStatus] = useState<Status>('pending')
  const [items, setItems] = useState<Any[] | null>(null)
  const [error, setError] = useState('')
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    try {
      const r = await getCattleQueue<Any>(kind, status, token)
      setItems(r.listings)
      setError('')
    } catch {
      setError('Could not load the queue. Try again.')
    }
  }, [kind, status, token])

  useEffect(() => {
    setItems(null)
    setRejecting(null)
    void load()
  }, [load])

  async function decide(id: string, decision: 'approve' | 'reject') {
    if (!token) return
    if (decision === 'reject' && !note.trim()) {
      setNoteError('Tell the seller why.')
      return
    }
    setBusy(true)
    try {
      await reviewCattleListing(kind, id, decision, decision === 'reject' ? note : '', token)
      setRejecting(null)
      setNote('')
      setNoteError('')
      await load()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('Someone else already changed this listing. The list was refreshed.')
        await load()
      } else {
        setError('Could not save that. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  if (user && user.role !== 'staff') {
    return (
      <Page>
        <h1 className="text-2xl font-semibold">Staff only</h1>
        <p className="mt-2 text-muted-foreground">This page is for Red Angus Association staff.</p>
      </Page>
    )
  }

  return (
    <Page>
      <h1 className="text-3xl font-semibold tracking-tight">Review listings</h1>
      <nav aria-label="Kind of cattle" className="mt-4 flex gap-1 border-b">
        {(['feeder', 'breeding'] as CattleKind[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === kind}
            onClick={() => setKind(k)}
            className={cn('-mb-px rounded-t-md border border-b-0 px-5 py-2 text-sm font-medium', k === kind ? 'border-border bg-card text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
          >
            {k === 'feeder' ? 'Feeder Cattle' : 'Breeding Cattle'}
          </button>
        ))}
      </nav>
      <div className="mt-4 grid max-w-xs gap-1.5">
        <Label htmlFor="status">Show</Label>
        <Select id="status" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
          {(Object.keys(STATUS_TABS) as Status[]).map((t) => (
            <option key={t} value={t}>
              {STATUS_TABS[t]}
            </option>
          ))}
        </Select>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {!items && !error && <p className="mt-6 text-sm text-muted-foreground">Loading...</p>}
      {items && items.length === 0 && <p className="mt-6 text-muted-foreground">Nothing here.</p>}

      <div className="mt-6 grid gap-4">
        {items?.map((l) => (
          <Card key={l.id}>
            <CardContent className="grid gap-3 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link to={`/${kind}/${l.id}`} className="text-lg font-medium text-primary underline">
                    {l.headline}
                  </Link>
                  <Summary kind={kind} l={l} />
                  <p className="text-sm text-muted-foreground">
                    From {l.sellerName} - {l.contactPhone} - {l.contactEmail}
                  </p>
                  {l.reviewNote && <p className="mt-1 text-sm">Note: {l.reviewNote}</p>}
                </div>
                <div className="flex gap-2">
                  {status !== 'approved' && (
                    <Button size="sm" disabled={busy} onClick={() => void decide(l.id, 'approve')}>
                      Approve
                    </Button>
                  )}
                  {status !== 'rejected' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setRejecting(l.id)
                        setNote('')
                        setNoteError('')
                      }}
                    >
                      {status === 'approved' ? 'Pull back' : 'Reject'}
                    </Button>
                  )}
                </div>
              </div>
              {l.description && <p className="whitespace-pre-line text-sm">{l.description}</p>}
              <PhotoStrip photos={l.photos} />
              {hasDocuments(l, true) && (
                <div className="grid gap-1">
                  <p className="text-sm font-medium">Documents</p>
                  <DocumentList kind={kind} listing={l} />
                </div>
              )}
              {rejecting === l.id && (
                <div className="grid gap-2">
                  <Label htmlFor={`note-${l.id}`}>Reason for the seller</Label>
                  <textarea id={`note-${l.id}`} rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                  {noteError && <p className="text-sm text-destructive">{noteError}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy} onClick={() => void decide(l.id, 'reject')}>
                      Send
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRejecting(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </Page>
  )
}
