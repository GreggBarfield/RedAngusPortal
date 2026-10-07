import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { FormField } from '@/components/FormField'
import type { Feedlot, FeedlotInput } from '@/lib/api'

const TEXT_FIELDS = ['name', 'contactName', 'address', 'city', 'state', 'zip', 'phone', 'fax', 'website', 'notes', 'doNotEmailNote'] as const
type TextField = (typeof TEXT_FIELDS)[number]

type FormState = Record<TextField, string> & { emails: string; enabled: boolean; doNotEmail: boolean }

function fromFeedlot(f?: Feedlot): FormState {
  return {
    name: f?.name ?? '',
    contactName: f?.contactName ?? '',
    address: f?.address ?? '',
    city: f?.city ?? '',
    state: f?.state ?? '',
    zip: f?.zip ?? '',
    phone: f?.phone ?? '',
    fax: f?.fax ?? '',
    website: f?.website ?? '',
    notes: f?.notes ?? '',
    doNotEmailNote: f?.doNotEmailNote ?? '',
    emails: (f?.emails ?? []).join('\n'),
    enabled: f ? f.enabled !== false : true,
    doNotEmail: f?.doNotEmail === true,
  }
}

// Email addresses as typed -> a plain list, for comparing what changed.
function emailList(text: string): string[] {
  return text
    .split(/[;,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

const textareaClass =
  'rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

interface Props {
  // Present when editing. Without it the form is for a new feedlot.
  feedlot?: Feedlot
  fieldErrors: Record<string, string>
  busy: boolean
  submitLabel: string
  onSubmit: (input: FeedlotInput) => void | Promise<void>
}

export default function FeedlotForm({ feedlot, fieldErrors, busy, submitLabel, onSubmit }: Props) {
  const [form, setForm] = useState<FormState>(() => fromFeedlot(feedlot))
  const [problem, setProblem] = useState('')
  const loaded = fromFeedlot(feedlot)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))
  const text = (k: TextField, label: string, extra: { hint?: string; autoComplete?: string } = {}) => (
    <FormField id={'feedlot-' + k} label={label} value={form[k]} onChange={(v) => set(k, v)} error={fieldErrors[k]} {...extra} />
  )

  function submit(e: FormEvent) {
    e.preventDefault()
    setProblem('')
    const out: FeedlotInput = {}
    if (!feedlot) {
      // A new feedlot: send everything that was filled in.
      for (const k of TEXT_FIELDS) {
        if (k === 'doNotEmailNote' && !form.doNotEmail) continue
        const v = form[k].trim()
        if (v !== '' || k === 'name' || k === 'state') (out as Record<string, unknown>)[k] = v
      }
      out.emails = form.emails
      out.enabled = form.enabled
      out.doNotEmail = form.doNotEmail
      void onSubmit(out)
      return
    }
    // An edit: send only what is different from what was loaded.
    for (const k of TEXT_FIELDS) {
      if (k === 'doNotEmailNote' && !form.doNotEmail) continue
      if (form[k].trim() !== loaded[k].trim()) (out as Record<string, unknown>)[k] = form[k].trim()
    }
    if (emailList(form.emails).join(',') !== emailList(loaded.emails).join(',')) out.emails = form.emails
    if (form.enabled !== loaded.enabled) out.enabled = form.enabled
    if (form.doNotEmail !== loaded.doNotEmail) out.doNotEmail = form.doNotEmail
    if (Object.keys(out).length === 0) {
      setProblem('Nothing has been changed.')
      return
    }
    void onSubmit(out)
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {text('name', 'Feedlot name')}
      <div className="grid gap-4 sm:grid-cols-2">
        {text('contactName', 'Contact name')}
        {text('website', 'Website', { hint: 'For example www.example.com' })}
      </div>
      {text('address', 'Street address or PO Box')}
      <div className="grid gap-4 sm:grid-cols-[1fr_6rem_9rem]">
        {text('city', 'City')}
        {text('state', 'State', { hint: '2 letters' })}
        {text('zip', 'Zip')}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {text('phone', 'Phone', { hint: 'More than one number: separate with a semicolon.' })}
        {text('fax', 'Fax number', { hint: 'Typed in by hand. Nothing is sent to it yet.' })}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="feedlot-emails">Email addresses</Label>
        <textarea
          id="feedlot-emails"
          rows={3}
          value={form.emails}
          onChange={(e) => set('emails', e.target.value)}
          aria-invalid={fieldErrors.emails ? true : undefined}
          aria-describedby="feedlot-emails-help"
          className={textareaClass}
        />
        <p id="feedlot-emails-help" className={fieldErrors.emails ? 'text-sm text-destructive' : 'text-xs text-muted-foreground'}>
          {fieldErrors.emails || 'Showlists go to these. Put each on its own line, or separate with commas (up to 5).'}
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="feedlot-notes">Staff notes</Label>
        <textarea id="feedlot-notes" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} className={textareaClass} />
        {fieldErrors.notes ? (
          <p className="text-sm text-destructive">{fieldErrors.notes}</p>
        ) : (
          <p className="text-xs text-muted-foreground">Only staff can see these.</p>
        )}
      </div>

      <fieldset className="grid gap-2 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Settings</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />
          Active (shown in the directory and used for showlists). Turn off to retire a feedlot.
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.doNotEmail} onChange={(e) => set('doNotEmail', e.target.checked)} />
          Do not email this feedlot
        </label>
        {form.doNotEmail && <div className="ml-6">{text('doNotEmailNote', 'Why (optional)')}</div>}
      </fieldset>

      {fieldErrors._ && (
        <p role="alert" className="text-sm text-destructive">
          {fieldErrors._}
        </p>
      )}
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving...' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
