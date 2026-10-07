import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import FeedlotForm from '@/components/FeedlotForm'
import { ApiError, deleteFeedlot, getFeedlot, getFeedlotLog, updateFeedlot } from '@/lib/api'
import type { Feedlot, FeedlotInput, FeedlotLogEntry } from '@/lib/api'
import { useAuth } from '@/lib/auth'

const FIELD_LABELS: Record<string, string> = {
  name: 'the name',
  contactName: 'the contact name',
  address: 'the address',
  city: 'the city',
  state: 'the state',
  zip: 'the zip',
  phone: 'the phone',
  emails: 'the email addresses',
  fax: 'the fax number',
  website: 'the website',
  notes: 'the staff notes',
  enabled: 'Active',
  doNotEmail: 'Do not email',
  doNotEmailNote: 'the do-not-email note',
}

function shown(field: string, v: string | null) {
  if (v == null || v.trim() === '') return '(empty)'
  if (field === 'enabled' || field === 'doNotEmail') return v === 'true' ? 'yes' : 'no'
  return v.length > 80 ? v.slice(0, 80) + '...' : v
}

function logLine(l: FeedlotLogEntry) {
  const when = new Date(l.changedAt).toLocaleString()
  if (l.field === 'created') return `${when} - ${l.changedBy} added this feedlot`
  if (l.field === 'deleted') return `${when} - ${l.changedBy} removed ${l.oldValue ?? 'this feedlot'}`
  return `${when} - ${l.changedBy} changed ${FIELD_LABELS[l.field] ?? l.field} from ${shown(l.field, l.oldValue)} to ${shown(l.field, l.newValue)}`
}

function href(w: string) {
  return /^https?:\/\//i.test(w) ? w : 'https://' + w
}

export default function FeedlotDetail() {
  const { id } = useParams()
  const { user, token, loading: authLoading } = useAuth()
  const feedlotId = Number(id)
  const [feedlot, setFeedlot] = useState<Feedlot | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await getFeedlot(feedlotId, token)
      setFeedlot(r.feedlot)
      setNotFound(false)
      setError('')
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true)
      else setError('Could not load this feedlot. Try again.')
    }
  }, [feedlotId, token])

  useEffect(() => {
    if (authLoading) return
    void load()
  }, [load, authLoading])

  if (notFound) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Feedlot not found</h1>
        <p className="mt-2">
          <Link to="/feedlots" className="text-primary underline">
            Back to the feedlot list
          </Link>
        </p>
      </main>
    )
  }
  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p role="alert" className="text-destructive">
          {error}
        </p>
      </main>
    )
  }
  if (!feedlot) return <p className="px-6 py-16 text-center text-sm text-muted-foreground">Loading...</p>

  const isStaff = user?.role === 'staff'

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <p className="text-sm">
        <Link to="/feedlots" className="text-primary underline">
          All feedlots
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{feedlot.name}</h1>
        {isStaff && feedlot.enabled === false && <Badge variant="outline">Retired</Badge>}
        {isStaff && feedlot.doNotEmail && <Badge variant="secondary">Do not email</Badge>}
      </div>
      <p className="mt-1 text-muted-foreground">{[feedlot.city, feedlot.state].filter(Boolean).join(', ')}</p>
      {feedlot.website && (
        <p className="mt-1 text-sm">
          <a href={href(feedlot.website)} target="_blank" rel="noopener noreferrer" className="text-primary underline">
            {feedlot.website}
          </a>
        </p>
      )}

      {!user ? (
        <Card className="mt-6">
          <CardContent className="py-4 text-sm">
            <Link to="/login" state={{ from: `/feedlots/${feedlotId}` }} className="text-primary underline">
              Sign in
            </Link>{' '}
            to see this feedlot&apos;s phone, email and contact.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-2 text-sm">
                {[
                  ['Contact', feedlot.contactName],
                  ['Phone', feedlot.phone],
                  ['Fax', feedlot.fax],
                  ['Email', feedlot.emails && feedlot.emails.length > 0 ? feedlot.emails.join(', ') : null],
                  ['Address', [feedlot.address, feedlot.city, feedlot.state, feedlot.zip].filter(Boolean).join(', ')],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-right font-medium">{v || '-'}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          {isStaff && token && <StaffTools feedlot={feedlot} token={token} onSaved={setFeedlot} />}
        </>
      )}
    </main>
  )
}

function StaffTools({ feedlot, token, onSaved }: { feedlot: Feedlot; token: string; onSaved: (f: Feedlot) => void }) {
  const navigate = useNavigate()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<FeedlotLogEntry[]>([])
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removeProblem, setRemoveProblem] = useState('')

  const reloadLog = useCallback(() => {
    getFeedlotLog(feedlot.id, token)
      .then((r) => setLog(r.log))
      .catch(() => setLog([]))
  }, [feedlot.id, token])

  useEffect(() => {
    reloadLog()
  }, [reloadLog])

  async function save(changes: FeedlotInput) {
    setBusy(true)
    setProblem('')
    setMessage('')
    setFieldErrors({})
    try {
      const r = await updateFeedlot(feedlot.id, changes, token)
      onSaved(r.feedlot)
      setMessage('Saved.')
      reloadLog()
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setFieldErrors(err.fields)
        if (Object.keys(err.fields).length === 0) setProblem('Check the values and try again.')
      } else if (err instanceof ApiError && err.status === 409) {
        setProblem('Another feedlot already has that name, city and state.')
      } else if (err instanceof ApiError && err.status === 404) {
        setProblem('This feedlot has been removed.')
      } else {
        setProblem('Could not save. Nothing was changed. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setRemoveProblem('')
    try {
      await deleteFeedlot(feedlot.id, token)
      navigate('/feedlots')
    } catch {
      setRemoveProblem('Could not remove it. Nothing was changed. Try again.')
      setBusy(false)
    }
  }

  return (
    <>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Edit feedlot (staff)</CardTitle>
          <CardDescription>Every change is recorded in the change log below.</CardDescription>
        </CardHeader>
        <CardContent>
          <FeedlotForm key={feedlot.updatedAt} feedlot={feedlot} fieldErrors={fieldErrors} busy={busy} submitLabel="Save changes" onSubmit={save} />
          {problem && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {problem}
            </p>
          )}
          {message && <p className="mt-3 text-sm text-primary">{message}</p>}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Change log</CardTitle>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">No changes recorded.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {log.map((l) => (
                <li key={l.id}>{logLine(l)}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Remove this feedlot</CardTitle>
          <CardDescription>
            To keep the record but stop showing it or emailing it, turn off Active or turn on Do not email above instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!confirmRemove ? (
            <Button type="button" variant="outline" onClick={() => setConfirmRemove(true)}>
              Remove feedlot
            </Button>
          ) : (
            <div className="grid gap-3 text-sm">
              <p className="font-medium text-destructive">Remove {feedlot.name} for good? This cannot be undone.</p>
              <div className="flex gap-2">
                <Button type="button" disabled={busy} onClick={() => void remove()}>
                  Yes, remove it
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmRemove(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {removeProblem && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {removeProblem}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  )
}
