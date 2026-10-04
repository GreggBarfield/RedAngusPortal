import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { FormField } from '@/components/FormField'
import { ApiError, createFeeder, getFeeder, updateFeeder } from '@/lib/api'
import type { FeederLot } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { BASIS_LABELS, HORN_LABELS, SALE_LABELS, SEX_LABELS } from '@/lib/feeders'

type Form = Record<string, string>

const EMPTY: Form = {
  title: '',
  headCount: '',
  sex: '',
  avgWeight: '',
  weightLow: '',
  weightHigh: '',
  breed: '',
  ageMonths: '',
  weanedDays: '',
  healthProgram: '',
  hornStatus: '',
  siredBy: '',
  saleType: '',
  availableDate: '',
  city: '',
  state: '',
  zip: '',
  askingPrice: '',
  priceBasis: 'per_cwt',
  description: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
}

function fromLot(l: FeederLot): Form {
  const s = (v: string | number | null | undefined) => (v == null ? '' : String(v))
  return {
    title: l.title,
    headCount: s(l.headCount),
    sex: l.sex,
    avgWeight: s(l.avgWeight),
    weightLow: s(l.weightLow),
    weightHigh: s(l.weightHigh),
    breed: s(l.breed),
    ageMonths: s(l.ageMonths),
    weanedDays: s(l.weanedDays),
    healthProgram: s(l.healthProgram),
    hornStatus: s(l.hornStatus),
    siredBy: s(l.siredBy),
    saleType: s(l.saleType),
    availableDate: s(l.availableDate),
    city: l.city,
    state: l.state,
    zip: s(l.zip),
    askingPrice: s(l.askingPrice),
    priceBasis: l.priceBasis ?? 'per_cwt',
    description: s(l.description),
    contactName: s(l.contactName),
    contactPhone: s(l.contactPhone),
    contactEmail: s(l.contactEmail),
  }
}

function Choice({
  id,
  label,
  value,
  onChange,
  options,
  blank,
  error,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  options: Record<string, string>
  blank: string
  error?: string
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select id={id} value={value} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value)}>
        <option value="">{blank}</option>
        {Object.entries(options).map(([k, text]) => (
          <option key={k} value={k}>
            {text}
          </option>
        ))}
      </Select>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

function Check({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4" />
      <Label htmlFor={id}>{label}</Label>
    </div>
  )
}

export default function FeederForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState<Form>(() => ({
    ...EMPTY,
    contactName: user?.displayName ?? '',
    contactEmail: user?.email ?? '',
  }))
  const [weaned, setWeaned] = useState(false)
  const [bunkBroke, setBunkBroke] = useState(false)
  const [callForPrice, setCallForPrice] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(!editing)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!id || !token) return
    let cancelled = false
    getFeeder(id, token)
      .then((r) => {
        if (cancelled) return
        if (!r.lot.mine || r.lot.status === 'sold' || r.lot.status === 'withdrawn') {
          setMissing(true)
          return
        }
        setForm(fromLot(r.lot))
        setWeaned(r.lot.weaned)
        setBunkBroke(r.lot.bunkBroke)
        setCallForPrice(r.lot.callForPrice)
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
      const body: Record<string, string | boolean> = { ...form, weaned, bunkBroke, callForPrice }
      if (callForPrice) body.askingPrice = ''
      if (!weaned) body.weanedDays = ''
      const r = id ? await updateFeeder(id, body, token) : await createFeeder(body, token)
      navigate('/my-listings', { replace: true, state: { saved: r.lot.title, edited: editing } })
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setFields(err.fields)
        setError('Some answers need fixing. Look for the red messages below.')
      } else if (err instanceof ApiError && err.status === 429) {
        setError('You have posted a lot of lots today. Try again tomorrow.')
      } else if (err instanceof ApiError && err.status === 409) {
        setError('This lot is closed and cannot be changed.')
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
        <h1 className="text-2xl font-semibold">Lot not found</h1>
        <p className="mt-2">
          <Link to="/my-listings" className="text-primary underline">
            Back to my listings
          </Link>
        </p>
      </main>
    )
  }
  if (!loaded) return <p className="px-6 py-16 text-center text-sm text-muted-foreground">Loading...</p>

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">{editing ? 'Edit feeder lot' : 'List a feeder lot'}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {editing
          ? 'After you save, our staff will look at it again before it goes back online.'
          : 'Our staff looks at each lot before it goes online. You will see its status under My listings.'}
      </p>

      <form onSubmit={onSubmit} className="mt-6 grid gap-6" noValidate>
        <Card>
          <CardHeader>
            <CardTitle>The lot</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FormField id="title" label="Title" value={form.title} onChange={set('title')} error={fields.title} hint="Example: 60 black-red steer calves" />
            </div>
            <FormField id="headCount" label="Number of head" value={form.headCount} onChange={set('headCount')} error={fields.headCount} />
            <Choice id="sex" label="Sex" value={form.sex} onChange={set('sex')} options={SEX_LABELS} blank="Choose" error={fields.sex} />
            <FormField id="avgWeight" label="Average weight (lb)" value={form.avgWeight} onChange={set('avgWeight')} error={fields.avgWeight} />
            <div />
            <FormField id="weightLow" label="Lightest (lb)" value={form.weightLow} onChange={set('weightLow')} error={fields.weightLow} />
            <FormField id="weightHigh" label="Heaviest (lb)" value={form.weightHigh} onChange={set('weightHigh')} error={fields.weightHigh} />
            <FormField id="breed" label="Breed" value={form.breed} onChange={set('breed')} error={fields.breed} hint="Example: 75% Red Angus" />
            <FormField id="ageMonths" label="Age (months)" value={form.ageMonths} onChange={set('ageMonths')} error={fields.ageMonths} />
            <FormField id="siredBy" label="Sired by" value={form.siredBy} onChange={set('siredBy')} error={fields.siredBy} />
            <Choice id="hornStatus" label="Horns" value={form.hornStatus} onChange={set('hornStatus')} options={HORN_LABELS} blank="Not sure" error={fields.hornStatus} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Management</CardTitle>
            <CardDescription>Buyers look hard at weaning and shots.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Check id="weaned" label="Weaned" checked={weaned} onChange={setWeaned} />
            {weaned && (
              <FormField id="weanedDays" label="Days weaned" value={form.weanedDays} onChange={set('weanedDays')} error={fields.weanedDays} />
            )}
            <Check id="bunkBroke" label="Bunk broke" checked={bunkBroke} onChange={setBunkBroke} />
            <div className="grid gap-1.5">
              <Label htmlFor="healthProgram">Vaccinations and health program</Label>
              <textarea
                id="healthProgram"
                rows={3}
                value={form.healthProgram}
                onChange={(e) => set('healthProgram')(e.target.value)}
                aria-invalid={fields.healthProgram ? true : undefined}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive"
              />
              {fields.healthProgram && <p className="text-sm text-destructive">{fields.healthProgram}</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Where, when and how much</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField id="city" label="City" value={form.city} onChange={set('city')} error={fields.city} />
            <FormField id="state" label="State (2 letters)" value={form.state} onChange={set('state')} error={fields.state} />
            <FormField id="zip" label="Zip code" value={form.zip} onChange={set('zip')} error={fields.zip} hint="Only you and our staff see this." />
            <FormField id="availableDate" label="Delivery or pickup date" type="date" value={form.availableDate} onChange={set('availableDate')} error={fields.availableDate} />
            <Choice id="saleType" label="Sale type" value={form.saleType} onChange={set('saleType')} options={SALE_LABELS} blank="Not sure" error={fields.saleType} />
            <div />
            <FormField
              id="askingPrice"
              label="Asking price ($)"
              value={callForPrice ? '' : form.askingPrice}
              onChange={set('askingPrice')}
              error={fields.askingPrice}
            />
            <Choice id="priceBasis" label="Price is" value={form.priceBasis} onChange={set('priceBasis')} options={BASIS_LABELS} blank="Choose" error={fields.priceBasis} />
            <div className="sm:col-span-2">
              <Check id="callForPrice" label="Call for price" checked={callForPrice} onChange={setCallForPrice} />
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
