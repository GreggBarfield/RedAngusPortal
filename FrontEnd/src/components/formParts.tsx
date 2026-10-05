import { useEffect, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Check, Field, SelectField, Span, TextField, useDebounced } from '@/components/form'
import { ApiError, addAuction, addVaccineProduct, getAuctions, getVaccineProducts, getZip } from '@/lib/api'
import type { AuctionMarket, VaccineProduct } from '@/lib/api'
import { BASIS_LABELS, US_STATES } from '@/lib/cattle'

type Errors = Record<string, string>

// State and zip of the cattle. The zip is looked up so the city shows up and the state can be filled in.
export function PlaceFields({
  state,
  zip,
  errors,
  onState,
  onZip,
}: {
  state: string
  zip: string
  errors: Errors
  onState: (v: string) => void
  onZip: (v: string) => void
}) {
  const [city, setCity] = useState('')
  const [lookupError, setLookupError] = useState('')

  useEffect(() => {
    if (!/^\d{5}$/.test(zip)) {
      setCity('')
      setLookupError('')
      return
    }
    let cancelled = false
    getZip(zip)
      .then((z) => {
        if (cancelled) return
        setCity(`${z.city}, ${z.state}`)
        setLookupError('')
        if (!state) onState(z.state)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setCity('')
        setLookupError(err instanceof ApiError && err.status === 404 ? 'We could not find that zip code.' : '')
      })
    return () => {
      cancelled = true
    }
    // The state is only filled in when it is blank, so it is not a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zip])

  return (
    <>
      <SelectField id="state" label="State" value={state} onChange={onState} error={errors.state} blank="Choose a state" options={US_STATES} />
      <TextField
        id="zip"
        label="Zip code"
        value={zip}
        onChange={(v) => onZip(v.replace(/\D/g, '').slice(0, 5))}
        error={errors.zip || lookupError}
        hint={city ? `Location: ${city}` : 'Only you and our staff see the zip code. It is used for distance searches.'}
        inputMode="numeric"
      />
    </>
  )
}

export function PriceFields({
  askingPrice,
  priceBasis,
  callForPrice,
  withBasis,
  errors,
  onChange,
}: {
  askingPrice: string
  priceBasis: string
  callForPrice: boolean
  withBasis: boolean
  errors: Errors
  onChange: (key: 'askingPrice' | 'priceBasis' | 'callForPrice', v: string | boolean) => void
}) {
  return (
    <>
      <TextField id="askingPrice" label="Asking price ($)" value={askingPrice} onChange={(v) => onChange('askingPrice', v)} error={errors.askingPrice} inputMode="decimal" hint="Leave blank if you do not want to list a price." />
      {withBasis && (
        <SelectField
          id="priceBasis"
          label="Price is"
          value={priceBasis}
          onChange={(v) => onChange('priceBasis', v)}
          error={errors.priceBasis}
          blank="Choose..."
          options={Object.entries(BASIS_LABELS)}
        />
      )}
      <div className="flex items-end pb-1.5">
        <Check id="callForPrice" label="Call for price" checked={callForPrice} onChange={(v) => onChange('callForPrice', v)} />
      </div>
    </>
  )
}

export function ContactFields({
  values,
  errors,
  onChange,
}: {
  values: { contactName: string; contactPhone: string; contactEmail: string }
  errors: Errors
  onChange: (key: 'contactName' | 'contactPhone' | 'contactEmail', v: string) => void
}) {
  return (
    <>
      <TextField id="contactName" label="Contact name" value={values.contactName} onChange={(v) => onChange('contactName', v)} error={errors.contactName} />
      <TextField id="contactPhone" label="Contact phone" value={values.contactPhone} onChange={(v) => onChange('contactPhone', v)} error={errors.contactPhone} inputMode="tel" hint="Only signed-in users see this." />
      <TextField id="contactEmail" label="Contact email" value={values.contactEmail} onChange={(v) => onChange('contactEmail', v)} error={errors.contactEmail} inputMode="email" hint="Only signed-in users see this." />
    </>
  )
}

// Small inline form used by "Add ... Not Listed".
function NotListed({
  title,
  initialName,
  extraLabel,
  onSave,
  onCancel,
}: {
  title: string
  initialName: string
  extraLabel: string
  onSave: (name: string, extra: string) => Promise<void>
  onCancel: () => void
}) {
  const base = useId()
  const [name, setName] = useState(initialName)
  const [extra, setExtra] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    setError('')
    try {
      await onSave(name.trim(), extra.trim())
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) setError(Object.values(err.fields)[0] ?? 'Check what you typed.')
      else if (err instanceof ApiError && err.status === 429) setError('You have added a lot today. Try again tomorrow.')
      else setError('Could not add that. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-3 rounded-md border bg-muted/40 p-3" role="group" aria-label={title}>
      <p className="text-sm font-medium">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${base}-name`}>Name</Label>
          <Input id={`${base}-name`} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${base}-extra`}>{extraLabel}</Label>
          <Input id={`${base}-extra`} value={extra} onChange={(e) => setExtra(e.target.value)} />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={busy || name.trim().length < 2} onClick={() => void save()}>
          Add to the list
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

// Auction market: pick from BTN's list, or add one that is not listed.
export function AuctionPicker({
  id,
  label,
  name,
  token,
  error,
  onPick,
}: {
  id: string
  label: string
  name: string
  token: string | null
  error?: string
  onPick: (name: string, auctionNo: number | null) => void
}) {
  const [results, setResults] = useState<AuctionMarket[]>([])
  const [adding, setAdding] = useState(false)
  const q = useDebounced(name)

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    getAuctions(q.trim())
      .then((r) => {
        if (!cancelled) setResults(r.auctions)
      })
      .catch(() => {
        if (!cancelled) setResults([])
      })
    return () => {
      cancelled = true
    }
  }, [q])

  const exact = results.find((a) => a.name.toLowerCase() === name.trim().toLowerCase())
  const showAdd = name.trim().length >= 2 && !exact && q === name && !adding

  return (
    <Span cols={2}>
      <Field id={id} label={label} error={error}>
        <Input
          id={id}
          list={`${id}-list`}
          value={name}
          placeholder="Start typing the market's name..."
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            const v = e.target.value
            const hit = results.find((a) => a.name === v)
            onPick(v, hit ? hit.auctionNo : null)
          }}
        />
        <datalist id={`${id}-list`}>
          {results.map((a) => (
            <option key={a.id} value={a.name} />
          ))}
        </datalist>
        {showAdd && (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
              Add Auction Not Listed
            </Button>
          </div>
        )}
        {adding && (
          <NotListed
            title="Add Auction Not Listed"
            initialName={name.trim()}
            extraLabel="Zip code (optional)"
            onCancel={() => setAdding(false)}
            onSave={async (n, zip) => {
              const r = await addAuction(n, zip || null, token ?? '')
              onPick(r.auction.name, r.auction.auctionNo)
              setAdding(false)
            }}
          />
        )}
      </Field>
    </Span>
  )
}

// Product given in a vaccination row: pick from BTN's list, or add one that is not listed.
export function ProductPicker({
  id,
  value,
  token,
  error,
  onChange,
}: {
  id: string
  value: string
  token: string | null
  error?: boolean
  onChange: (v: string) => void
}) {
  const [results, setResults] = useState<VaccineProduct[]>([])
  const [adding, setAdding] = useState(false)
  const q = useDebounced(value)

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    getVaccineProducts(q.trim())
      .then((r) => {
        if (!cancelled) setResults(r.products)
      })
      .catch(() => {
        if (!cancelled) setResults([])
      })
    return () => {
      cancelled = true
    }
  }, [q])

  const exact = results.some((p) => p.name.toLowerCase() === value.trim().toLowerCase())
  const showAdd = value.trim().length >= 2 && !exact && q === value && !adding

  return (
    <div className="grid content-start gap-1.5">
      <Input
        id={id}
        list={`${id}-list`}
        value={value}
        placeholder="Start typing the product..."
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={`${id}-list`}>
        {results.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
      {showAdd && (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
            Add Product Not Listed
          </Button>
        </div>
      )}
      {adding && (
        <NotListed
          title="Add Product Not Listed"
          initialName={value.trim()}
          extraLabel="Company (optional)"
          onCancel={() => setAdding(false)}
          onSave={async (n, company) => {
            const r = await addVaccineProduct(n, company || null, token ?? '')
            onChange(r.product.name)
            setAdding(false)
          }}
        />
      )}
    </div>
  )
}
