import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { MediaSection } from '@/components/Media'
import { Check, Field, MultiSelect, FormBanner, Section, SelectField, Span, TextArea, TextField } from '@/components/form'
import { AuctionPicker, ContactFields, PlaceFields, PriceFields } from '@/components/formParts'
import { ApiError, getBreeds, getCattleListing, getEpdTraits, saveCattleListing } from '@/lib/api'
import type { BreedingListing, EpdTrait, ListingAttachment, ListingPhoto } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { BREED_CLASS_LABELS, SALE_TYPE_LABELS, SEX_CLASS_LABELS } from '@/lib/cattle'
import { emptyDraft, uploadDraft } from '@/lib/media'

interface EpdRow {
  key: number
  trait: string
  value: string
  unknown: boolean
}

interface Form {
  headCount: string
  sexClass: string
  birthDate: string
  regNumber: string
  breeds: string[]
  breedClass: string
  primaryBreed: string
  sire: string
  dam: string
  headline: string
  description: string
  epds: EpdRow[]
  saleTitle: string
  saleType: string
  auctionName: string
  auctionNo: number | null
  saleDate: string
  state: string
  zip: string
  askingPrice: string
  callForPrice: boolean
  contactName: string
  contactPhone: string
  contactEmail: string
}

let rowKey = 1
const blankEpd = (): EpdRow => ({ key: rowKey++, trait: '', value: '', unknown: false })
const s = (v: string | number | null | undefined) => (v == null ? '' : String(v))

function blankForm(name: string, email: string): Form {
  return {
    headCount: '',
    sexClass: '',
    birthDate: '',
    regNumber: '',
    breeds: [],
    breedClass: '',
    primaryBreed: '',
    sire: '',
    dam: '',
    headline: '',
    description: '',
    epds: [blankEpd()],
    saleTitle: '',
    saleType: '',
    auctionName: '',
    auctionNo: null,
    saleDate: '',
    state: '',
    zip: '',
    askingPrice: '',
    callForPrice: false,
    contactName: name,
    contactPhone: '',
    contactEmail: email,
  }
}

function fromListing(l: BreedingListing): Form {
  return {
    headCount: s(l.headCount),
    sexClass: l.sexClass,
    birthDate: s(l.birthDate).slice(0, 10),
    regNumber: s(l.regNumber),
    breeds: l.breeds,
    breedClass: s(l.breedClass),
    primaryBreed: s(l.primaryBreed),
    sire: s(l.sire),
    dam: s(l.dam),
    headline: s(l.headline),
    description: s(l.description),
    epds: l.epds.length ? l.epds.map((e) => ({ key: rowKey++, trait: e.trait, value: e.value == null ? '' : String(e.value), unknown: e.unknown })) : [blankEpd()],
    saleTitle: s(l.saleTitle),
    saleType: l.saleType,
    auctionName: s(l.auctionName),
    auctionNo: l.auctionNo,
    saleDate: s(l.saleDate).slice(0, 10),
    state: l.state,
    zip: s(l.zip),
    askingPrice: s(l.askingPrice),
    callForPrice: l.callForPrice,
    contactName: s(l.contactName),
    contactPhone: s(l.contactPhone),
    contactEmail: s(l.contactEmail),
  }
}

function toPayload(f: Form) {
  const auction = f.saleType === 'auction' || f.saleType === 'video_auction'
  return {
    headCount: f.headCount,
    sexClass: f.sexClass,
    birthDate: f.birthDate,
    regNumber: f.regNumber,
    breeds: f.breeds,
    breedClass: f.breedClass,
    primaryBreed: f.primaryBreed,
    sire: f.sire,
    dam: f.dam,
    headline: f.headline,
    description: f.description,
    epds: f.epds.map((e) => ({ trait: e.trait, value: e.value, unknown: e.unknown })),
    saleTitle: f.saleTitle,
    saleType: f.saleType,
    auctionName: auction ? f.auctionName : '',
    auctionNo: auction && f.auctionNo != null ? f.auctionNo : '',
    saleDate: f.saleDate,
    state: f.state,
    zip: f.zip,
    askingPrice: f.askingPrice,
    callForPrice: f.callForPrice,
    contactName: f.contactName,
    contactPhone: f.contactPhone,
    contactEmail: f.contactEmail,
  }
}

export default function BreedingForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState<Form>(() => blankForm(user?.displayName ?? '', user?.email ?? ''))
  const [breeds, setBreeds] = useState<string[]>([])
  const [traits, setTraits] = useState<EpdTrait[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [banner, setBanner] = useState((location.state as { notice?: string } | null)?.notice ?? '')
  const [photos, setPhotos] = useState<ListingPhoto[]>([])
  const [docs, setDocs] = useState<ListingAttachment[]>([])
  const [draft, setDraft] = useState(emptyDraft)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const bannerRef = useRef<HTMLDivElement>(null)

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [b, t] = await Promise.all([getBreeds(), getEpdTraits()])
        if (cancelled) return
        setBreeds(b.breeds)
        setTraits(t.traits)
      } catch {
        if (!cancelled) setBanner('The pick lists (breeds and EPD traits) could not be loaded. Reload the page to try again.')
      }
      if (editing && id && token) {
        try {
          const r = await getCattleListing<BreedingListing>('breeding', id, token)
          if (cancelled) return
          if (!r.listing.mine) {
            navigate('/my-listings', { replace: true })
            return
          }
          setForm(fromListing(r.listing))
          setPhotos(r.listing.photos ?? [])
          setDocs(r.listing.attachments ?? [])
        } catch {
          if (!cancelled) setBanner('Could not load that listing.')
        }
      }
      if (!cancelled) setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [editing, id, token, navigate])

  const auction = form.saleType === 'auction' || form.saleType === 'video_auction'

  function setEpd(key: number, patch: Partial<EpdRow>) {
    set('epds', form.epds.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!token) return
    setBusy(true)
    setBanner('')
    setErrors({})
    try {
      const r = await saveCattleListing<BreedingListing>('breeding', editing ? (id ?? null) : null, toPayload(form), token)
      const problems = await uploadDraft('breeding', r.listing.id, draft, token)
      if (problems.length > 0) {
        // The listing is saved. Go to its edit page so the files can be added again (not saved twice).
        navigate(`/list/breeding/${r.listing.id}/edit`, {
          state: { notice: `Your listing was saved, but some files did not go through: ${problems.join(' ')} Add them again below.` },
        })
        return
      }
      navigate('/my-listings', { state: { saved: r.listing.headline, edited: editing } })
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setErrors(err.fields)
        setBanner('Some fields need another look. They are marked below.')
      } else if (err instanceof ApiError && err.status === 429) {
        setBanner('You have listed 20 groups today. Please try again tomorrow.')
      } else if (err instanceof ApiError && err.status === 409) {
        setBanner('This listing is closed and cannot be changed.')
      } else {
        setBanner('Could not save. Check your connection and try again.')
      }
      setTimeout(() => bannerRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }), 0)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="py-10 text-sm text-muted-foreground">Loading...</p>

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-6">
      <div ref={bannerRef}>{banner && <FormBanner>{banner}</FormBanner>}</div>

      <Section title="Basic Information">
        <TextField id="headCount" label="Number of head" value={form.headCount} onChange={(v) => set('headCount', v.replace(/\D/g, ''))} error={errors.headCount} inputMode="numeric" />
        <SelectField id="sexClass" label="Sex / class" value={form.sexClass} onChange={(v) => set('sexClass', v)} error={errors.sexClass} blank="Choose..." options={Object.entries(SEX_CLASS_LABELS)} />
        <TextField id="birthDate" label="Date of birth" type="date" value={form.birthDate} onChange={(v) => set('birthDate', v)} error={errors.birthDate} />
        <TextField id="regNumber" label="Registration number" value={form.regNumber} onChange={(v) => set('regNumber', v)} error={errors.regNumber} />

        <Span cols={2}>
          <MultiSelect id="breeds" label="Breed(s)" options={breeds} selected={form.breeds} onChange={(v) => set('breeds', v)} max={10} searchable error={errors.breeds} />
        </Span>
        <SelectField id="breedClass" label="Breed class" value={form.breedClass} onChange={(v) => set('breedClass', v)} error={errors.breedClass} blank="Choose..." options={Object.entries(BREED_CLASS_LABELS)} />
        <SelectField id="primaryBreed" label="Primary breed" value={form.primaryBreed} onChange={(v) => set('primaryBreed', v)} error={errors.primaryBreed} blank="First breed above" options={form.breeds.map((b) => [b, b])} />

        <Span cols={2}>
          <TextField id="sire" label="Sire" value={form.sire} onChange={(v) => set('sire', v)} error={errors.sire} />
        </Span>
        <Span cols={2}>
          <TextField id="dam" label="Dam" value={form.dam} onChange={(v) => set('dam', v)} error={errors.dam} />
        </Span>

        <Span>
          <TextField id="headline" label="Headline" value={form.headline} onChange={(v) => set('headline', v)} error={errors.headline} hint="Optional. We write one for you if you leave this blank." />
        </Span>
        <Span>
          <TextArea id="description" label="Description" value={form.description} onChange={(v) => set('description', v)} error={errors.description} rows={4} />
        </Span>
      </Section>

      <MediaSection kind="breeding" listingId={editing ? (id ?? null) : null} token={token} photos={photos} docs={docs} onExisting={(a, b) => { setPhotos(a); setDocs(b) }} draft={draft} onDraft={setDraft} />

      <Section title="EPDs" hint="Add the EPDs you have. Leave the value blank or check Unknown when you do not have one.">
        <div className="col-span-full grid gap-4">
          {errors.epds && (
            <p role="alert" className="text-sm text-destructive">
              {errors.epds}
            </p>
          )}
          {form.epds.map((row, i) => (
            <div key={row.key} className="grid items-end gap-4 sm:grid-cols-[1fr_10rem_auto_auto]">
              <Field id={`epdTrait${i}`} label="Trait">
                <Select id={`epdTrait${i}`} value={row.trait} onChange={(e) => setEpd(row.key, { trait: e.target.value })}>
                  <option value="">Choose a trait...</option>
                  {traits.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id={`epdValue${i}`} label="Value">
                <Input id={`epdValue${i}`} inputMode="decimal" value={row.value} disabled={row.unknown} onChange={(e) => setEpd(row.key, { value: e.target.value })} />
              </Field>
              <div className="pb-1.5">
                <Check id={`epdUnknown${i}`} label="Unknown" checked={row.unknown} onChange={(v) => setEpd(row.key, { unknown: v, value: v ? '' : row.value })} />
              </div>
              <Button type="button" variant="outline" size="sm" aria-label={`Remove EPD row ${i + 1}`} onClick={() => set('epds', form.epds.length > 1 ? form.epds.filter((r) => r.key !== row.key) : [blankEpd()])}>
                Remove
              </Button>
            </div>
          ))}
          <div>
            <Button type="button" variant="outline" size="sm" disabled={form.epds.length >= 40} onClick={() => set('epds', [...form.epds, blankEpd()])}>
              Add another
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Sale Information">
        <Span cols={2}>
          <TextField id="saleTitle" label="Sale title" value={form.saleTitle} onChange={(v) => set('saleTitle', v)} error={errors.saleTitle} hint="Optional - the name of your sale or offering." />
        </Span>
        <SelectField id="saleType" label="Sale type" value={form.saleType} onChange={(v) => set('saleType', v)} error={errors.saleType} blank="Choose..." options={Object.entries(SALE_TYPE_LABELS)} />
        <TextField id="saleDate" label="Sale date" type="date" value={form.saleDate} onChange={(v) => set('saleDate', v)} error={errors.saleDate} />
        {auction && (
          <AuctionPicker id="auctionName" label="Auction market" name={form.auctionName} token={token} error={errors.auctionName} onPick={(name, no) => setForm((f) => ({ ...f, auctionName: name, auctionNo: no }))} />
        )}
        <PlaceFields state={form.state} zip={form.zip} errors={errors} onState={(v) => set('state', v)} onZip={(v) => set('zip', v)} />
      </Section>

      <Section title="Price">
        <PriceFields askingPrice={form.askingPrice} priceBasis="" callForPrice={form.callForPrice} withBasis={false} errors={errors} onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))} />
      </Section>

      <Section title="Contact" hint="Buyers see this only when they are signed in.">
        <ContactFields values={form} errors={errors} onChange={(k, v) => set(k, v)} />
      </Section>

      <div className="flex flex-wrap items-center gap-3 pb-8">
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? 'Saving...' : editing ? 'Save changes' : 'Submit for review'}
        </Button>
        <p className="text-sm text-muted-foreground">Our staff look at every listing before it goes online.</p>
      </div>
    </form>
  )
}
