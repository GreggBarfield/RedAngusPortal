import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  ApiError,
  getShowlistLots,
  getShowlistRecipients,
  getShowlistStatus,
  previewShowlist,
  sendShowlist,
  testShowlist,
} from '@/lib/api'
import type { MarketingMethod, ShowlistLot, ShowlistRecipient, ShowlistStatus } from '@/lib/api'
import { formatDate, METHOD_LABELS } from '@/lib/cattle'
import { useAuth } from '@/lib/auth'

const textareaClass =
  'rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const DAY = 24 * 60 * 60 * 1000

function serverMessage(err: unknown): string {
  const m = (err as { serverMessage?: string } | null)?.serverMessage
  return m || ''
}

export default function ShowlistNew() {
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState<ShowlistStatus | null>(null)
  const [lots, setLots] = useState<ShowlistLot[] | null>(null)
  const [feedlots, setFeedlots] = useState<ShowlistRecipient[] | null>(null)
  const [blocked, setBlocked] = useState(0)
  const [loadError, setLoadError] = useState('')

  const [lotSel, setLotSel] = useState<Set<number>>(new Set())
  const [feedSel, setFeedSel] = useState<Set<number>>(new Set())
  const [subject, setSubject] = useState('Red Angus feeder cattle for sale')
  const [intro, setIntro] = useState('')

  const [q, setQ] = useState('')
  const [state, setState] = useState('')
  const [recent, setRecent] = useState('')

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [problem, setProblem] = useState('')
  const [preview, setPreview] = useState('')
  const [testTo, setTestTo] = useState(user?.email ?? '')
  const [testNote, setTestNote] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const isStaff = user?.role === 'staff' && Boolean(token)

  useEffect(() => {
    if (!isStaff || !token) return
    let cancelled = false
    Promise.all([getShowlistStatus(token), getShowlistLots(token), getShowlistRecipients(token)])
      .then(([s, l, r]) => {
        if (cancelled) return
        setStatus(s)
        setLots(l.lots)
        setFeedlots(r.feedlots)
        setBlocked(r.blocked)
        setFeedSel(new Set(r.feedlots.map((f) => f.id)))
      })
      .catch(() => {
        if (!cancelled) setLoadError('Could not load the lists. Try again.')
      })
    return () => {
      cancelled = true
    }
  }, [isStaff, token])

  useEffect(() => {
    if (user?.email && !testTo) setTestTo(user.email)
  }, [user, testTo])

  const states = useMemo(() => Array.from(new Set((feedlots ?? []).map((f) => f.state))).sort(), [feedlots])

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    const now = Date.now()
    return (feedlots ?? []).filter((f) => {
      if (state && f.state !== state) return false
      if (term && !`${f.name} ${f.city ?? ''}`.toLowerCase().includes(term)) return false
      if (recent === 'never' && f.lastSent) return false
      if (recent === '7' && f.lastSent && now - new Date(f.lastSent).getTime() < 7 * DAY) return false
      if (recent === '30' && f.lastSent && now - new Date(f.lastSent).getTime() < 30 * DAY) return false
      return true
    })
  }, [feedlots, q, state, recent])

  const chosenFeedlots = (feedlots ?? []).filter((f) => feedSel.has(f.id))
  const emailCount = new Set(chosenFeedlots.flatMap((f) => f.emails.map((e) => e.toLowerCase()))).size

  function toggle(set: Set<number>, id: number, on: boolean): Set<number> {
    const next = new Set(set)
    if (on) next.add(id)
    else next.delete(id)
    return next
  }

  function compose() {
    return { subject: subject.trim(), intro: intro.trim(), lotIds: Array.from(lotSel) }
  }

  async function doPreview() {
    if (!token) return
    setProblem('')
    setFieldErrors({})
    setTestNote('')
    try {
      const r = await previewShowlist(compose(), token)
      setPreview(r.html)
    } catch (err) {
      setPreview('')
      if (err instanceof ApiError && err.status === 400) setFieldErrors(err.fields)
      else setProblem('Could not build the preview. Try again.')
    }
  }

  async function doTest() {
    if (!token) return
    setProblem('')
    setFieldErrors({})
    setTestNote('')
    try {
      const r = await testShowlist({ ...compose(), to: testTo.trim() }, token)
      setTestNote(`Test email sent to ${r.to}. It can take a minute to arrive.`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) setFieldErrors(err.fields)
      else if (err instanceof ApiError && err.status === 503) setProblem('Email is not set up on the server yet, so nothing can be sent.')
      else setProblem(serverMessage(err) || 'The test email did not go out.')
    }
  }

  async function doSend() {
    if (!token) return
    setBusy(true)
    setProblem('')
    setFieldErrors({})
    try {
      const r = await sendShowlist({ ...compose(), feedlotIds: Array.from(feedSel) }, token)
      navigate(`/staff/showlists/${r.showlist.id}`)
    } catch (err) {
      setConfirming(false)
      setBusy(false)
      if (err instanceof ApiError && err.status === 400) setFieldErrors(err.fields)
      else if (err instanceof ApiError && err.status === 409) setProblem(serverMessage(err) || 'A showlist is still being sent. Wait for it to finish.')
      else if (err instanceof ApiError && err.status === 503) setProblem('Email is not set up on the server yet, so nothing can be sent.')
      else setProblem('Could not send. Nothing was sent. Try again.')
    }
  }

  if (!isStaff) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Staff only</h1>
        <p className="mt-2">
          <Link to="/" className="text-primary underline">
            Back to the home page
          </Link>
        </p>
      </main>
    )
  }

  const canSend = Boolean(status?.configured) && lotSel.size > 0 && feedSel.size > 0 && subject.trim().length >= 3

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <p className="text-sm">
        <Link to="/staff/showlists" className="text-primary underline">
          All showlists
        </Link>
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Send a showlist</h1>
      <p className="mt-2 text-muted-foreground">
        Pick the cattle, write a note, pick the feedlots, then look at the preview and send. Every email has an unsubscribe link.
      </p>

      {status && !status.configured && (
        <p role="alert" className="mt-4 rounded-md border border-destructive p-3 text-sm text-destructive">
          Email is not set up on the server yet, so sending is turned off. Still needed in the server settings: {status.missing.join(', ')}.
          You can still build a showlist and look at the preview.
        </p>
      )}
      {status && status.configured && (
        <p className="mt-4 text-sm text-muted-foreground">
          Emails go out from {status.from}. Replies go to {status.replyTo}.
        </p>
      )}
      {loadError && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {loadError}
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-xl font-semibold">1. Which cattle</h2>
        {!lots && !loadError && <p className="mt-2 text-sm text-muted-foreground">Loading...</p>}
        {lots && lots.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">No approved feeder cattle are waiting to sell. Approve a listing first.</p>
        )}
        {lots && lots.length > 0 && (
          <>
            <div className="mt-2 flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setLotSel(new Set(lots.map((l) => l.id)))}>
                Pick all
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setLotSel(new Set())}>
                Pick none
              </Button>
            </div>
            <div className="mt-2 grid gap-2">
              {lots.map((l) => (
                <Card key={l.id}>
                  <CardContent className="py-3">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={lotSel.has(l.id)}
                        onChange={(e) => setLotSel(toggle(lotSel, l.id, e.target.checked))}
                        aria-label={`Include ${l.headline}`}
                      />
                      <span>
                        <span className="font-medium">{l.headline}</span>
                        <span className="block text-sm text-muted-foreground">
                          {l.headCount} head - {METHOD_LABELS[l.marketingMethod as MarketingMethod] ?? l.marketingMethod} {formatDate(l.marketingDate)} -{' '}
                          {[l.city, l.state].filter(Boolean).join(', ')} - {l.contactName}
                        </span>
                      </span>
                    </label>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
        {fieldErrors.lotIds && <p className="mt-2 text-sm text-destructive">{fieldErrors.lotIds}</p>}
      </section>

      <section className="mt-8 grid gap-4">
        <h2 className="text-xl font-semibold">2. The message</h2>
        <div className="grid gap-1.5">
          <Label htmlFor="sl-subject">Subject</Label>
          <Input id="sl-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} />
          {fieldErrors.subject && <p className="text-sm text-destructive">{fieldErrors.subject}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sl-intro">Note above the table (optional)</Label>
          <textarea id="sl-intro" rows={4} value={intro} onChange={(e) => setIntro(e.target.value)} className={textareaClass} maxLength={3000} />
          {fieldErrors.intro && <p className="text-sm text-destructive">{fieldErrors.intro}</p>}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">3. Which feedlots</h2>
        {!feedlots && !loadError && <p className="mt-2 text-sm text-muted-foreground">Loading...</p>}
        {feedlots && (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              {feedlots.length} feedlots can be emailed.
              {blocked > 0 && ` ${blocked} more are left out because they are marked Do not email.`} Everything is ticked to start; untick any you want to skip.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_9rem_12rem] sm:items-end">
              <div className="grid gap-1.5">
                <Label htmlFor="sl-q">Search name or city</Label>
                <Input id="sl-q" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sl-state">State</Label>
                <Select id="sl-state" value={state} onChange={(e) => setState(e.target.value)}>
                  <option value="">All states</option>
                  {states.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sl-recent">Last emailed</Label>
                <Select id="sl-recent" value={recent} onChange={(e) => setRecent(e.target.value)}>
                  <option value="">Any time</option>
                  <option value="never">Never</option>
                  <option value="7">Not in the last 7 days</option>
                  <option value="30">Not in the last 30 days</option>
                </Select>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const next = new Set(feedSel)
                  shown.forEach((f) => next.add(f.id))
                  setFeedSel(next)
                }}
              >
                Tick all shown ({shown.length})
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const next = new Set(feedSel)
                  shown.forEach((f) => next.delete(f.id))
                  setFeedSel(next)
                }}
              >
                Untick all shown
              </Button>
              <span className="text-sm" data-testid="feedlot-count">
                {feedSel.size} feedlots ticked - {emailCount} email addresses
              </span>
            </div>
            <div className="mt-2 max-h-96 overflow-y-auto rounded-md border">
              {shown.length === 0 && <p className="p-3 text-sm text-muted-foreground">No feedlots match.</p>}
              {shown.map((f) => (
                <label key={f.id} className="flex cursor-pointer items-start gap-3 border-b px-3 py-2 last:border-b-0">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={feedSel.has(f.id)}
                    onChange={(e) => setFeedSel(toggle(feedSel, f.id, e.target.checked))}
                    aria-label={`Email ${f.name}`}
                  />
                  <span className="text-sm">
                    <span className="font-medium">{f.name}</span>{' '}
                    <span className="text-muted-foreground">{[f.city, f.state].filter(Boolean).join(', ')}</span>
                    <span className="block text-muted-foreground">
                      {f.emails.join(', ')}
                      {f.lastSent ? ` - last emailed ${formatDate(f.lastSent)}` : ''}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {fieldErrors.feedlotIds && <p className="mt-2 text-sm text-destructive">{fieldErrors.feedlotIds}</p>}
          </>
        )}
      </section>

      <section className="mt-8 grid gap-4">
        <h2 className="text-xl font-semibold">4. Check it, then send</h2>
        <div className="flex flex-wrap items-end gap-3">
          <Button type="button" variant="outline" onClick={doPreview} disabled={lotSel.size === 0}>
            Preview
          </Button>
          <div className="grid gap-1.5">
            <Label htmlFor="sl-test">Send a test to</Label>
            <Input id="sl-test" type="email" className="w-64" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          </div>
          <Button type="button" variant="outline" onClick={doTest} disabled={lotSel.size === 0 || !status?.configured || !testTo.trim()}>
            Send test
          </Button>
        </div>
        {fieldErrors.to && <p className="text-sm text-destructive">{fieldErrors.to}</p>}
        {testNote && <p className="text-sm">{testNote}</p>}
        {preview && (
          <iframe title="Preview of the email" sandbox="" srcDoc={preview} className="h-[28rem] w-full rounded-md border bg-white" />
        )}

        {!confirming && (
          <div>
            <Button type="button" onClick={() => setConfirming(true)} disabled={!canSend}>
              Send to {feedSel.size} feedlots
            </Button>
          </div>
        )}
        {confirming && (
          <div role="alertdialog" aria-label="Confirm sending" className="rounded-md border border-primary p-4">
            <p className="font-medium">
              Send {lotSel.size} lot{lotSel.size === 1 ? '' : 's'} to {feedSel.size} feedlots ({emailCount} email addresses)?
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Emails cannot be taken back once they go out.</p>
            <div className="mt-3 flex gap-2">
              <Button type="button" onClick={doSend} disabled={busy}>
                {busy ? 'Sending...' : 'Yes, send now'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
        {status && (status.sending ? <Badge variant="secondary">A showlist is being sent right now</Badge> : null)}
      </section>
    </main>
  )
}
