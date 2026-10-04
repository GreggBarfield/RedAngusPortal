import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { FormField } from '@/components/FormField'
import { ApiError, ConflictError, getBarn, getBarnLog, saveBarnContact, saveBarnSettings } from '@/lib/api'
import type { Barn, BarnContactValues, BarnLogEntry } from '@/lib/api'
import { useAuth } from '@/lib/auth'

const FIELD_LABELS: Record<string, string> = {
  email: 'Email',
  phone: 'Phone',
  fax: 'Fax',
  contactName: 'Contact name',
}
const FIELD_KEYS = ['contactName', 'phone', 'fax', 'email'] as const

function toForm(b: Barn): Record<string, string> {
  return {
    email: b.email ?? '',
    phone: b.phone ?? '',
    fax: b.fax ?? '',
    contactName: b.contactName ?? '',
  }
}

function loadedValues(b: Barn): BarnContactValues {
  return {
    email: b.email ?? null,
    phone: b.phone ?? null,
    fax: b.fax ?? null,
    contactName: b.contactName ?? null,
  }
}

function show(v: string | null | undefined) {
  return v && v.trim() ? v : '(empty)'
}

export default function BarnDetail() {
  const { id } = useParams()
  const { user, token, loading: authLoading } = useAuth()
  const barnId = Number(id)
  const [barn, setBarn] = useState<Barn | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await getBarn(barnId, token)
      setBarn(r.barn)
      setNotFound(false)
      setError('')
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true)
      else setError('Could not load this barn. Try again.')
    }
  }, [barnId, token])

  useEffect(() => {
    if (authLoading) return
    void load()
  }, [load, authLoading])

  if (notFound) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Barn not found</h1>
        <p className="mt-2">
          <Link to="/barns" className="text-primary underline">
            Back to the barn list
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
  if (!barn) return <p className="px-6 py-16 text-center text-sm text-muted-foreground">Loading...</p>

  const isStaff = user?.role === 'staff'

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <p className="text-sm">
        <Link to="/barns" className="text-primary underline">
          All sale barns
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{barn.name}</h1>
        {barn.category === 'VID' && <Badge variant="secondary">Video sale</Badge>}
        {!barn.isActive && <Badge variant="outline">Not active</Badge>}
      </div>
      <p className="mt-1 text-muted-foreground">{[barn.city, barn.state].filter(Boolean).join(', ')}</p>

      {!user ? (
        <Card className="mt-6">
          <CardContent className="py-4 text-sm">
            <Link to="/login" state={{ from: `/barns/${barnId}` }} className="text-primary underline">
              Sign in
            </Link>{' '}
            to see this barn&apos;s fax, email, phone and contact.
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
                  ['Contact', barn.contactName],
                  ['Phone', barn.phone],
                  ['Fax', barn.fax],
                  ['Email', barn.email],
                  ['Address', [barn.address, barn.city, barn.state, barn.zip].filter(Boolean).join(', ')],
                  ['Sends by', barn.sendMethod ?? barn.btnPreferredMethod],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-right font-medium">{v || '-'}</dd>
                  </div>
                ))}
              </dl>
              {barn.enabled === false && <p className="mt-3 text-sm text-destructive">Sending to this barn is turned off.</p>}
            </CardContent>
          </Card>
          {isStaff && token && <StaffTools barn={barn} token={token} onChanged={load} />}
        </>
      )}
    </main>
  )
}

function StaffTools({ barn, token, onChanged }: { barn: Barn; token: string; onChanged: () => Promise<void> }) {
  const [form, setForm] = useState<Record<string, string>>(() => toForm(barn))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState<{ current: BarnContactValues; conflicts: string[] } | null>(null)
  const [log, setLog] = useState<BarnLogEntry[]>([])

  const [sendMethod, setSendMethod] = useState<string>(barn.sendMethod ?? '')
  const [enabled, setEnabled] = useState(barn.enabled !== false)
  const [notes, setNotes] = useState(barn.notes ?? '')
  const [setMsg, setSetMsg] = useState('')
  const [setErr, setSetErr] = useState('')

  const reloadLog = useCallback(() => {
    getBarnLog(barn.auctionNo, token)
      .then((r) => setLog(r.log))
      .catch(() => setLog([]))
  }, [barn.auctionNo, token])

  useEffect(() => {
    reloadLog()
  }, [reloadLog])

  // When the barn is reloaded (after a save, or "Reload what BTN has"), show what BTN has.
  useEffect(() => {
    setForm(toForm(barn))
  }, [barn])

  const loaded = loadedValues(barn)

  function pendingChanges(): Partial<BarnContactValues> {
    const out: Partial<BarnContactValues> = {}
    for (const k of FIELD_KEYS) {
      const now = form[k].trim()
      const before = (loaded[k] ?? '').trim()
      if (now !== before) out[k] = now === '' ? null : now
    }
    return out
  }

  async function send(overwrite: boolean) {
    const changes = pendingChanges()
    if (Object.keys(changes).length === 0) {
      setProblem('Nothing has been changed.')
      return
    }
    setBusy(true)
    setProblem('')
    setMessage('')
    setFieldErrors({})
    try {
      const r = await saveBarnContact(barn.auctionNo, changes, loaded, overwrite, token)
      setConflict(null)
      setMessage(
        r.logged
          ? 'Saved here and in BTN.'
          : 'Saved in BTN, but the change could not be written to the log. Tell the developer.',
      )
      await onChanged()
      reloadLog()
    } catch (err) {
      if (err instanceof ConflictError) {
        setConflict({ current: err.current, conflicts: err.conflicts })
      } else if (err instanceof ApiError && err.status === 400) {
        setFieldErrors(err.fields)
        if (Object.keys(err.fields).length === 0) setProblem('Check the values and try again.')
      } else if (err instanceof ApiError && err.status === 503) {
        setProblem('Saving to BTN is not set up on the server yet.')
      } else {
        setProblem('Could not save. Nothing was changed. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void send(false)
  }

  async function onReload() {
    setConflict(null)
    setMessage('')
    await onChanged()
  }

  async function onSaveSettings(e: FormEvent) {
    e.preventDefault()
    setSetMsg('')
    setSetErr('')
    try {
      await saveBarnSettings(
        barn.auctionNo,
        {
          sendMethod: sendMethod === 'email' || sendMethod === 'fax' ? sendMethod : null,
          enabled,
          notes: notes.trim() === '' ? null : notes.trim(),
        },
        token,
      )
      setSetMsg('Settings saved.')
    } catch {
      setSetErr('Could not save settings.')
    }
  }

  return (
    <>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Edit contact (staff)</CardTitle>
          <CardDescription>
            Changes are saved here and in BTN, and recorded in the change log below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4" noValidate>
            {FIELD_KEYS.map((k) => (
              <FormField
                key={k}
                id={'edit-' + k}
                label={FIELD_LABELS[k]}
                type={k === 'email' ? 'email' : 'text'}
                value={form[k]}
                onChange={(v) => setForm({ ...form, [k]: v })}
                error={fieldErrors[k]}
              />
            ))}
            {conflict && (
              <div role="alert" className="rounded-md border border-destructive p-3 text-sm">
                <p className="font-medium text-destructive">BTN has different information than the page you opened.</p>
                <ul className="mt-2 list-disc pl-5">
                  {conflict.conflicts.map((k) => (
                    <li key={k}>
                      {FIELD_LABELS[k] ?? k}: BTN now has {show(conflict.current[k as keyof BarnContactValues])}, you saw{' '}
                      {show(loaded[k as keyof BarnContactValues])}, you are changing it to{' '}
                      {show(form[k]?.trim() || null)}.
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex gap-2">
                  <Button type="button" size="sm" disabled={busy} onClick={() => void send(true)}>
                    Overwrite BTN
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void onReload()}>
                    Reload what BTN has
                  </Button>
                </div>
              </div>
            )}
            {problem && (
              <p role="alert" className="text-sm text-destructive">
                {problem}
              </p>
            )}
            {message && <p className="text-sm text-primary">{message}</p>}
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving...' : 'Save contact'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Portal settings (staff)</CardTitle>
          <CardDescription>Kept only in the Red Angus portal. These do not change BTN.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSaveSettings} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="sendMethod">Send listings by</Label>
              <Select id="sendMethod" value={sendMethod} onChange={(e) => setSendMethod(e.target.value)}>
                <option value="">Use BTN&apos;s setting ({barn.btnPreferredMethod ?? 'none'})</option>
                <option value="email">Email</option>
                <option value="fax">Fax</option>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              Allow sending listings to this barn
            </label>
            <div className="grid gap-1.5">
              <Label htmlFor="notes">Staff notes</Label>
              <textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            {setErr && (
              <p role="alert" className="text-sm text-destructive">
                {setErr}
              </p>
            )}
            {setMsg && <p className="text-sm text-primary">{setMsg}</p>}
            <Button type="submit">Save settings</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Change log</CardTitle>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">No changes made through the portal yet.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {log.map((l) => (
                <li key={l.id}>
                  {new Date(l.changedAt).toLocaleString()} - {l.changedBy} changed {FIELD_LABELS[l.field] ?? l.field} from{' '}
                  {show(l.oldValue)} to {show(l.newValue)}
                  {l.overwrote ? ' (overwrote a newer BTN value)' : ''}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
