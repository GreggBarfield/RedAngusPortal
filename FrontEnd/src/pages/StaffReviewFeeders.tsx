import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { ApiError, getFeederQueue, reviewFeeder } from '@/lib/api'
import type { FeederLot } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { SEX_LABELS, formatFeederPrice, weightText } from '@/lib/feeders'
import { formatDate } from '@/lib/listings'

type Tab = 'pending' | 'approved' | 'rejected'
const TAB_LABELS: Record<Tab, string> = { pending: 'Waiting', approved: 'Live', rejected: 'Not approved' }

export default function StaffReviewFeeders() {
  const { user, token } = useAuth()
  const [tab, setTab] = useState<Tab>('pending')
  const [items, setItems] = useState<FeederLot[] | null>(null)
  const [error, setError] = useState('')
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    try {
      const r = await getFeederQueue(tab, token)
      setItems(r.lots)
      setError('')
    } catch {
      setError('Could not load the queue. Try again.')
    }
  }, [tab, token])

  useEffect(() => {
    setItems(null)
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
      await reviewFeeder(id, decision, decision === 'reject' ? note : '', token)
      setRejecting(null)
      setNote('')
      setNoteError('')
      await load()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('Someone else already changed this lot. The list was refreshed.')
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
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Staff only</h1>
        <p className="mt-2 text-muted-foreground">This page is for Red Angus Association staff.</p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Review feeder lots</h1>
      <p className="mt-1 text-sm">
        <Link to="/staff/review" className="text-primary underline">
          Review breeding cattle instead
        </Link>
      </p>
      <div className="mt-4 grid max-w-xs gap-1.5">
        <Label htmlFor="tab">Show</Label>
        <Select id="tab" value={tab} onChange={(e) => setTab(e.target.value as Tab)}>
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <option key={t} value={t}>
              {TAB_LABELS[t]}
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
                  <Link to={`/feeders/${l.id}`} className="text-lg font-medium text-primary underline">
                    {l.title}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {l.headCount} head {SEX_LABELS[l.sex].toLowerCase()} - {weightText(l)} - {l.city}, {l.state} - {formatFeederPrice(l)}
                  </p>
                  {l.availableDate && <p className="text-sm text-muted-foreground">Available {formatDate(l.availableDate)}</p>}
                  <p className="text-sm text-muted-foreground">
                    From {l.sellerName} - {l.contactPhone} - {l.contactEmail}
                  </p>
                  {l.reviewNote && <p className="mt-1 text-sm">Note: {l.reviewNote}</p>}
                </div>
                <div className="flex gap-2">
                  {tab !== 'approved' && (
                    <Button size="sm" disabled={busy} onClick={() => void decide(l.id, 'approve')}>
                      Approve
                    </Button>
                  )}
                  {tab !== 'rejected' && (
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
                      {tab === 'approved' ? 'Pull back' : 'Reject'}
                    </Button>
                  )}
                </div>
              </div>
              {l.description && <p className="whitespace-pre-line text-sm">{l.description}</p>}
              {rejecting === l.id && (
                <div className="grid gap-2">
                  <Label htmlFor={`note-${l.id}`}>Reason for the seller</Label>
                  <textarea
                    id={`note-${l.id}`}
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  />
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
    </main>
  )
}
