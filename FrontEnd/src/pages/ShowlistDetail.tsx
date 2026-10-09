import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { ApiError, getShowlist, resumeShowlist } from '@/lib/api'
import type { ShowlistDetail as Detail, ShowlistSend } from '@/lib/api'
import { useAuth } from '@/lib/auth'

const LABELS: Record<ShowlistSend['status'], string> = {
  QUEUED: 'Waiting',
  SENDING: 'Sending',
  SUBMITTED: 'Sent',
  DELIVERED: 'Delivered',
  FAILED: 'Failed',
  SUBMIT_FAILED: 'Not sent',
}

function when(s: ShowlistSend): string {
  const t = s.deliveredAt || s.failedAt || s.submittedAt
  return t ? new Date(t).toLocaleString() : ''
}

export default function ShowlistDetail() {
  const { id } = useParams()
  const { user, token } = useAuth()
  const [data, setData] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [note, setNote] = useState('')
  const isStaff = user?.role === 'staff' && Boolean(token)

  const load = useCallback(() => {
    if (!token || !id) return Promise.resolve()
    return getShowlist(id, token)
      .then((r) => {
        setData(r)
        setError('')
      })
      .catch((err) => {
        setError(err instanceof ApiError && err.status === 404 ? 'That showlist was not found.' : 'Could not load the showlist. Try again.')
      })
  }, [token, id])

  useEffect(() => {
    if (isStaff) load()
  }, [isStaff, load])

  const waiting = data ? data.counts.QUEUED + data.counts.SENDING : 0
  useEffect(() => {
    if (!isStaff || !data || (waiting === 0 && !data.active)) return
    const t = setInterval(() => {
      load()
    }, 4000)
    return () => clearInterval(t)
  }, [isStaff, data, waiting, load])

  async function resume() {
    if (!token || !id) return
    setNote('')
    try {
      await resumeShowlist(id, token)
      setNote('Sending again.')
      load()
    } catch (err) {
      const m = (err as { serverMessage?: string }).serverMessage
      setNote(m || 'Could not restart the sending. Try again.')
    }
  }

  if (!isStaff) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Staff only</h1>
      </main>
    )
  }

  const sends = (data?.sends ?? []).filter((s) => !filter || s.status === filter)

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <p className="text-sm">
        <Link to="/staff/showlists" className="text-primary underline">
          All showlists
        </Link>
      </p>
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {!data && !error && <p className="mt-4 text-sm text-muted-foreground">Loading...</p>}
      {data && (
        <>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{data.showlist.subject}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {new Date(data.showlist.createdAt).toLocaleString()} - by {data.showlist.createdBy} - {data.showlist.recipientCount} emails
          </p>
          <p className="mt-1 text-sm">Lots: {data.showlist.lots.map((l) => l.headline).join('; ')}</p>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="showlist-counts">
            {(['QUEUED', 'SUBMITTED', 'DELIVERED', 'FAILED', 'SUBMIT_FAILED'] as const).map((k) => (
              <Card key={k}>
                <CardContent className="py-3">
                  <p className="text-2xl font-semibold">{k === 'QUEUED' ? data.counts.QUEUED + data.counts.SENDING : data.counts[k]}</p>
                  <p className="text-sm text-muted-foreground">{LABELS[k]}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Sent means SMTP2GO accepted it. Delivered means the feedlot's mail server accepted it (this appears a little later). Failed means it bounced or was rejected. Not
            sent means SMTP2GO would not take it.
          </p>

          {waiting > 0 && !data.active && (
            <div className="mt-4 rounded-md border p-3">
              <p className="text-sm">{waiting} emails are still waiting and nothing is sending them right now.</p>
              <Button className="mt-2" size="sm" onClick={resume}>
                Send the rest
              </Button>
            </div>
          )}
          {data.active && <p className="mt-4 text-sm">Sending now. This page refreshes by itself.</p>}
          {note && <p className="mt-2 text-sm">{note}</p>}

          <div className="mt-6 flex items-center gap-2 text-sm">
            <Label htmlFor="sl-filter">Show</Label>
            <Select id="sl-filter" className="w-48" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">Everything</option>
              {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((k) => (
                <option key={k} value={k}>
                  {LABELS[k]}
                </option>
              ))}
            </Select>
          </div>
          <div className="mt-2 overflow-x-auto rounded-md border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2">Feedlot</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Result</th>
                  <th className="px-3 py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {sends.map((s) => (
                  <tr key={s.id} className="border-t align-top">
                    <td className="px-3 py-2">
                      <Link to={`/feedlots/${s.feedlotId}`} className="text-primary hover:underline">
                        {s.feedlotName}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{s.recipient}</td>
                    <td className="px-3 py-2">
                      <Badge variant={s.status === 'FAILED' || s.status === 'SUBMIT_FAILED' ? 'destructive' : 'secondary'}>{LABELS[s.status]}</Badge>
                      {s.unsubscribedAt && <Badge variant="outline">Unsubscribed</Badge>}
                      {s.detail && <p className="mt-1 max-w-md break-words text-xs text-muted-foreground">{s.detail}</p>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{when(s)}</td>
                  </tr>
                ))}
                {sends.length === 0 && (
                  <tr>
                    <td className="px-3 py-3 text-muted-foreground" colSpan={4}>
                      Nothing to show.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  )
}
