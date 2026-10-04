import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { FormField } from '@/components/FormField'
import { ApiError, createListing, getListing, updateListing } from '@/lib/api'
import type { Listing } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { KIND_LABELS } from '@/lib/listings'

type Form = Record<string, string>

const EMPTY: Form = {
  kind: '',
  name: '',
  regNumber: '',
  tag: '',
  birthDate: '',
  sireName: '',
  sireReg: '',
  damName: '',
  damReg: '',
  birthWeight: '',
  weaningWeight: '',
  yearlingWeight: '',
  scrotal: '',
  bredTo: '',
  dueDate: '',
  headCount: '1',
  city: '',
  state: '',
  zip: '',
  askingPrice: '',
  description: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
}

function fromListing(l: Listing): Form {
  const s = (v: string | number | null | undefined) => (v == null ? '' : String(v))
  return {
    kind: l.kind,
    name: l.name,
    regNumber: s(l.regNumber),
    tag: s(l.tag),
    birthDate: s(l.birthDate),
    sireName: s(l.sireName),
    sireReg: s(l.sireReg),
    damName: s(l.damName),
    damReg: s(l.damReg),
    birthWeight: s(l.birthWeight),
    weaningWeight: s(l.weaningWeight),
    yearlingWeight: s(l.yearlingWeight),
    scrotal: s(l.scrotal),
    bredTo: s(l.bredTo),
    dueDate: s(l.dueDate),
    headCount: s(l.headCount),
    city: l.city,
    state: l.state,
    zip: s(l.zip),
    askingPrice: s(l.askingPrice),
    description: s(l.description),
    contactName: s(l.contactName),
    contactPhone: s(l.contactPhone),
    contactEmail: s(l.contactEmail),
  }
}

export default function ListingForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState<Form>(() => ({
    ...EMPTY,
    contactName: user?.displayName ?? '',
    contactEmail: user?.email ?? '',
  }))
  const [callForPrice, setCallForPrice] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(!editing)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!id || !token) return
    let cancelled = false
    getListing(id, token)
      .then((r) => {
        if (cancelled) return
        if (!r.listing.mine || r.listing.status === 'sold' || r.listing.status === 'withdrawn') {
          setMissing(true)
          return
        }
        setForm(fromListing(r.listing))
        setCallForPrice(r.listing.callForPrice)
        setLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setMissing(true)
      })
    return () => {
      cancelled = true
    }
  }, [id, token])

  function set(key: string) {
    return (value: string) => setForm((f) => ({ ...f, [key]: value }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!token) return
    setError('')
    setFields({})
    setBusy(true)
    try {
      const body: Record<string, string | boolean> = { ...form, callForPrice }
      if (callForPrice) body.askingPrice = ''
      const r = id ? await updateListing(id, body, token) : await createListing(body, token)
      navigate('/my-listings', { replace: true, state: { saved: r.listing.name, edited: editing } })
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setFields(err.fields)
        setError('Some answers need fixing. Look for the red messages below.')
      } else if (err instanceof ApiError && err.status === 429) {
        setError('You have posted a lot of listings today. Try again tomorrow.')
      } else if (err instanceof ApiError && err.status === 409) {
        setError('This listing is closed and cannot be changed.')
      } else {
        setError('Could not reach the server. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  if (missing) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Listing not found</h1>
        <p className="mt-2">
          <Link to="/my-listings" className="text-primary underline">
            Back to my listings
          </Link>
        </p>
      </main>
    )
  }
  if (!loaded) return <p className="px-6 py-16 text-center text-sm text-muted-foreground">Loading...</p>

  const isBull = form.kind === 'bull'
  const isFemaleWithCalf = ['cow', 'bred_heifer', 'pair'].includes(form.kind)

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">{editing ? 'Edit listing' : 'List your cattle'}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {editing
          ? 'After you save, our staff will look at it again before it goes back online.'
          : 'Our staff looks at each listing before it goes online. You will see its status under My listings.'}
      </p>

      <form onSubmit={onSubmit} className="mt-6 grid gap-6" noValidate>
        <Card>
          <CardHeader>
            <CardTitle>The animal</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="kind">Type</Label>
              <Select
                id="kind"
                value={form.kind}
                aria-invalid={fields.kind ? true : undefined}
                onChange={(e) => set('kind')(e.target.value)}
              >
                <option value="">Choose a type</option>
                {Object.entries(KIND_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
              {fields.kind && <p className="text-sm text-destructive">{fields.kind}</p>}
            </div>
            <FormField id="name" label="Name" value={form.name} onChange={set('name')} error={fields.name} />
            <FormField id="regNumber" label="Registration number" value={form.regNumber} onChange={set('regNumber')} error={fields.regNumber} />
            <FormField id="tag" label="Tag or tattoo" value={form.tag} onChange={set('tag')} error={fields.tag} hint="Only you and our staff see this." />
            <FormField id="birthDate" label="Birth date" type="date" value={form.birthDate} onChange={set('birthDate')} error={fields.birthDate} />
            <FormField id="headCount" label="Number of head" value={form.headCount} onChange={set('headCount')} error={fields.headCount} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pedigree</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField id="sireName" label="Sire" value={form.sireName} onChange={set('sireName')} error={fields.sireName} />
            <FormField id="sireReg" label="Sire registration" value={form.sireReg} onChange={set('sireReg')} error={fields.sireReg} />
            <FormField id="damName" label="Dam" value={form.damName} onChange={set('damName')} error={fields.damName} />
            <FormField id="damReg" label="Dam registration" value={form.damReg} onChange={set('damReg')} error={fields.damReg} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Performance</CardTitle>
            <CardDescription>Leave blank anything you do not have.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField id="birthWeight" label="Birth weight (lb)" value={form.birthWeight} onChange={set('birthWeight')} error={fields.birthWeight} />
            <FormField id="weaningWeight" label="Weaning weight (lb)" value={form.weaningWeight} onChange={set('weaningWeight')} error={fields.weaningWeight} />
            <FormField id="yearlingWeight" label="Yearling weight (lb)" value={form.yearlingWeight} onChange={set('yearlingWeight')} error={fields.yearlingWeight} />
            {isBull && (
              <FormField id="scrotal" label="Scrotal circumference (cm)" value={form.scrotal} onChange={set('scrotal')} error={fields.scrotal} />
            )}
            {isFemaleWithCalf && (
              <>
                <FormField id="bredTo" label="Bred to" value={form.bredTo} onChange={set('bredTo')} error={fields.bredTo} />
                <FormField id="dueDate" label="Due date" type="date" value={form.dueDate} onChange={set('dueDate')} error={fields.dueDate} />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Where and how much</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField id="city" label="City" value={form.city} onChange={set('city')} error={fields.city} />
            <FormField id="state" label="State (2 letters)" value={form.state} onChange={set('state')} error={fields.state} />
            <FormField id="zip" label="Zip code" value={form.zip} onChange={set('zip')} error={fields.zip} hint="Only you and our staff see this." />
            <div />
            <FormField
              id="askingPrice"
              label="Asking price ($)"
              value={callForPrice ? '' : form.askingPrice}
              onChange={set('askingPrice')}
              error={fields.askingPrice}
            />
            <div className="flex items-end gap-2 pb-2">
              <input
                id="callForPrice"
                type="checkbox"
                checked={callForPrice}
                onChange={(e) => setCallForPrice(e.target.checked)}
                className="size-4"
              />
              <Label htmlFor="callForPrice">Call for price</Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5">
            <Label htmlFor="description">Anything else buyers should know</Label>
            <textarea
              id="description"
              rows={5}
              value={form.description}
              onChange={(e) => set('description')(e.target.value)}
              aria-invalid={fields.description ? true : undefined}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive"
            />
            {fields.description && <p className="text-sm text-destructive">{fields.description}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Who buyers should contact</CardTitle>
            <CardDescription>Only signed-in users can see these.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <FormField id="contactName" label="Contact name" value={form.contactName} onChange={set('contactName')} error={fields.contactName} />
            <FormField id="contactPhone" label="Phone" type="tel" value={form.contactPhone} onChange={set('contactPhone')} error={fields.contactPhone} />
            <FormField id="contactEmail" label="Email" type="email" value={form.contactEmail} onChange={set('contactEmail')} error={fields.contactEmail} />
          </CardContent>
        </Card>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving...' : editing ? 'Save changes' : 'Submit for approval'}
          </Button>
          <Button asChild variant="outline">
            <Link to="/my-listings">Cancel</Link>
          </Button>
        </div>
      </form>
    </main>
  )
}
