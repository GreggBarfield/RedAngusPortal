import { useEffect, useId, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Check, Field, SelectField, Span, TextField, useDebounced } from '@/components/form'
import { ApiError, addAuction, addVaccineProduct, getAuctions, getVaccineProducts, getZip } from '@/lib/api'
import type { AuctionMarket, VaccineProduct } from '@/lib/api'
import { BASIS_LABELS, US_STATES } from '@/lib/cattle'
import { cn } from '@/lib/utils'

type Errors = Record<string, string>

// Where the cattle are when they go through an auction market: the market's own location.
export interface FixedPlace {
  city: string | null
  state: string
  zip: string
}

// The market's location, or null when the market has no zip (or its zip is not in the zip table),
// in which case the seller still types the state and zip.
export function fixedPlace(market: AuctionMarket | null): FixedPlace | null {
  if (!market || !market.zip || !market.state) return null
  return { city: market.city ?? null, state: market.state, zip: market.zip }
}

interface PlaceForm {
  auctionName: string
  auctionNo: number | null
  state: string
  zip: string
}

// Used by the listing forms. Remembers which auction market was chosen and keeps the form's
// state and zip in step with it, so the seller never has to type the market's location.
export function useMarketPlace<F extends PlaceForm>(setForm: Dispatch<SetStateAction<F>>) {
  const [market, setMarket] = useState<AuctionMarket | null>(null)
  const fixed = fixedPlace(market)

  // A market name was typed or chosen (market is null while the name is not a match).
  function pick(name: string, auctionNo: number | null, m: AuctionMarket | null) {
    const next = fixedPlace(m)
    setMarket(m)
    setForm((f) => {
      const base = { ...f, auctionName: name, auctionNo }
      if (next) return { ...base, state: next.state, zip: next.zip }
      // The location came from the market that was chosen before, so it goes with it.
      return fixed ? { ...base, state: '', zip: '' } : base
    })
  }

  // The marketing method is not an auction any more: forget the market and its location.
  function leave() {
    if (!market) return
    setMarket(null)
    setForm((f) => ({ ...f, auctionName: '', auctionNo: null, ...(fixed ? { state: '', zip: '' } : {}) }))
  }

  // A saved listing is being edited: find its market again so its location shows as before.
  function restore(name: string, auctionNo: number | null) {
    if (auctionNo == null || !name) return
    getAuctions(name)
      .then((r) => {
        const m = r.auctions.find((a) => a.auctionNo === auctionNo) ?? null
        const next = fixedPlace(m)
        if (!m) return
        setMarket(m)
        if (next) setForm((f) => ({ ...f, state: next.state, zip: next.zip }))
      })
      .catch(() => {
        // The state and zip saved with the listing stay as they are.
      })
  }

  return { market, fixed, pick, leave, restore }
}

// State and zip of the cattle. The zip is looked up so the city shows up and the state can be filled in.
// When an auction market was chosen, its location is shown instead and nothing needs typing.
export function PlaceFields({
  state,
  zip,
  errors,
  onState,
  onZip,
  fixed = null,
  marketNoZip = false,
}: {
  state: string
  zip: string
  errors: Errors
  onState: (v: string) => void
  onZip: (v: string) => void
  fixed?: FixedPlace | null
  marketNoZip?: boolean
}) {
  const [city, setCity] = useState('')
  const [lookupError, setLookupError] = useState('')
  const isFixed = fixed != null

  useEffect(() => {
    if (isFixed || !/^\d{5}$/.test(zip)) {
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
  }, [zip, isFixed])

  if (fixed) {
    return (
      <Span cols={2}>
        <div role="group" aria-label="Location" className="grid gap-1.5">
          <p className="text-sm font-medium leading-none">Location</p>
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{`${fixed.city ? fixed.city + ', ' : ''}${fixed.state} ${fixed.zip}`}</p>
          <p className="text-xs text-muted-foreground">From the auction market you chose. Only you and our staff see the zip code. It is used for distance searches.</p>
        </div>
      </Span>
    )
  }

  return (
    <>
      <SelectField id="state" label="State" value={state} onChange={onState} error={errors.state} blank="Choose a state" options={US_STATES} />
      <TextField
        id="zip"
        label="Zip code"
        value={zip}
        onChange={(v) => onZip(v.replace(/\D/g, '').slice(0, 5))}
        error={errors.zip || lookupError}
        hint={
          city
            ? `Location: ${city}`
            : marketNoZip
              ? 'This auction market has no zip code on file. Enter the state and zip code of the market. Only you and our staff see the zip code.'
              : 'Only you and our staff see the zip code. It is used for distance searches.'
        }
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
  // market is the matching entry of BTN's list (with its location), or null while the name is not a match.
  onPick: (name: string, auctionNo: number | null, market: AuctionMarket | null) => void
}) {
  const [results, setResults] = useState<AuctionMarket[]>([])
  const [adding, setAdding] = useState(false)
  const q = useDebounced(name)
  // The list arrives a moment after the typing stops, so the match is also checked when it arrives.
  const nameRef = useRef(name)
  nameRef.current = name
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick
  const pickedNo = useRef<number | null>(null)

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    getAuctions(q.trim())
      .then((r) => {
        if (cancelled) return
        setResults(r.auctions)
        const typed = nameRef.current.trim().toLowerCase()
        const hit = r.auctions.find((a) => a.name.trim().toLowerCase() === typed)
        if (hit && pickedNo.current !== hit.auctionNo) {
          pickedNo.current = hit.auctionNo
          onPickRef.current(hit.name, hit.auctionNo, hit)
        }
      })
      .catch(() => {
        if (!cancelled) setResults([])
      })
    return () => {
      cancelled = true
    }
  }, [q])

  // Always offered, so people can find it before they have typed anything.
  const showAdd = !adding

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
            const typed = v.trim().toLowerCase()
            const hit = results.find((a) => a.name.trim().toLowerCase() === typed)
            pickedNo.current = hit ? hit.auctionNo : null
            onPick(v, hit ? hit.auctionNo : null, hit ?? null)
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
              pickedNo.current = r.auction.auctionNo
              onPick(r.auction.name, r.auction.auctionNo, r.auction)
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

  // Always offered, so people can find it before they have typed anything.
  const showAdd = !adding

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

// Optional breed makeup for feeder cattle: a percent or a head count for each chosen breed.
// It only warns when the amounts do not add up; the seller can still submit.
export function BreedMakeup({
  breeds,
  mode,
  amounts,
  totalHead,
  error,
  onMode,
  onAmount,
}: {
  breeds: string[]
  mode: '' | 'percent' | 'head'
  amounts: Record<string, string>
  totalHead: number
  error?: string
  onMode: (m: '' | 'percent' | 'head') => void
  onAmount: (breed: string, value: string) => void
}) {
  if (breeds.length === 0) return null
  const sum = breeds.reduce((t, b) => t + (Number(amounts[b]) || 0), 0)
  const any = breeds.some((b) => (amounts[b] ?? '').trim() !== '')
  const target = mode === 'percent' ? 100 : totalHead
  const off = mode !== '' && any && Math.abs(sum - target) > 0.001
  return (
    <fieldset className="col-span-full grid gap-3 rounded-md border bg-muted/30 p-4">
      <legend className="px-1 text-sm font-medium">Breed makeup (optional)</legend>
      <div className="grid grid-cols-1 items-start gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field id="breedMode" label="Show the breeds as">
          <Select id="breedMode" value={mode} onChange={(e) => onMode(e.target.value as '' | 'percent' | 'head')}>
            <option value="">Just the breed names</option>
            <option value="percent">Percent of each breed</option>
            <option value="head">Head count of each breed</option>
          </Select>
        </Field>
        {mode !== '' &&
          breeds.map((b, i) => (
            <Field key={b} id={`breedAmount${i}`} label={mode === 'percent' ? `${b} (%)` : `${b} (head)`}>
              <Input id={`breedAmount${i}`} inputMode="numeric" value={amounts[b] ?? ''} onChange={(e) => onAmount(b, e.target.value.replace(mode === 'head' ? /\D/g : /[^\d.]/g, ''))} />
            </Field>
          ))}
      </div>
      {mode !== '' && any && (
        <p className={cn('text-sm', off ? 'text-amber-700' : 'text-muted-foreground')} role={off ? 'status' : undefined}>
          {mode === 'percent' ? `Total: ${sum}%` : `Total: ${sum} of ${totalHead} head`}
          {off ? (mode === 'percent' ? ' - this does not add up to 100%. You can still submit.' : ' - this does not match the total head. You can still submit.') : ''}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  )
}
