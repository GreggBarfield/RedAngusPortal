import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Check, Field, FormBanner, Section, MultiSelect, SelectField, Span, TextArea, TextField } from '@/components/form'
import MarketInsightsButton from '@/components/MarketInsights'
import { AuctionPicker, BreedMakeup, ContactFields, PlaceFields, PriceFields, ProductPicker } from '@/components/formParts'
import { Input } from '@/components/ui/input'
import { MediaSection } from '@/components/Media'
import { ApiError, getBreeds, getCattleListing, getCountries, getGroupId, getPrograms, saveCattleListing } from '@/lib/api'
import type { FeederListing, ListingAttachment, ListingPhoto } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { METHOD_LABELS } from '@/lib/cattle'
import { emptyDraft, uploadDraft } from '@/lib/media'

interface Row {
  key: number
  date: string
  product: string
}

interface Form {
  groupId: string
  groupIdOptout: boolean
  steerCount: string
  heiferCount: string
  avgWeightSteers: string
  avgWeightHeifers: string
  breeds: string[]
  breedMode: '' | 'percent' | 'head'
  breedAmounts: Record<string, string>
  birthDate: string
  weanDate: string
  vetName: string
  birthCountry: string
  preconditioning: string[]
  special: string[]
  description: string
  nutrition: string
  vaccinations: Row[]
  marketingMethod: string
  auctionName: string
  auctionNo: number | null
  marketingDate: string
  state: string
  zip: string
  tagVisualStart: string
  tagVisualEnd: string
  tagEidStart: string
  tagEidEnd: string
  askingPrice: string
  priceBasis: string
  callForPrice: boolean
  contactName: string
  contactPhone: string
  contactEmail: string
}

let rowKey = 1
const blankRow = (): Row => ({ key: rowKey++, date: '', product: '' })

const s = (v: string | number | null | undefined) => (v == null ? '' : String(v))

function blankForm(name: string, email: string): Form {
  return {
    groupId: '',
    groupIdOptout: false,
    steerCount: '',
    heiferCount: '',
    avgWeightSteers: '',
    avgWeightHeifers: '',
    breeds: [],
    breedMode: '',
    breedAmounts: {},
    birthDate: '',
    weanDate: '',
    vetName: '',
    birthCountry: 'United States',
    preconditioning: [],
    special: [],
    description: '',
    nutrition: '',
    vaccinations: [blankRow()],
    marketingMethod: '',
    auctionName: '',
    auctionNo: null,
    marketingDate: '',
    state: '',
    zip: '',
    tagVisualStart: '',
    tagVisualEnd: '',
    tagEidStart: '',
    tagEidEnd: '',
    askingPrice: '',
    priceBasis: 'per_cwt',
    callForPrice: false,
    contactName: name,
    contactPhone: '',
    contactEmail: email,
  }
}

function fromListing(l: FeederListing): Form {
  return {
    groupId: s(l.groupId),
    groupIdOptout: l.groupIdOptout === true,
    steerCount: s(l.steerCount),
    heiferCount: s(l.heiferCount),
    avgWeightSteers: s(l.avgWeightSteers),
    avgWeightHeifers: s(l.avgWeightHeifers),
    breeds: l.breeds,
    breedMode: l.breedMode ?? '',
    breedAmounts: Object.fromEntries((l.breedDetails ?? []).filter((d) => d.amount != null).map((d) => [d.name, String(d.amount)])),
    birthDate: s(l.birthDate).slice(0, 10),
    weanDate: s(l.weanDate).slice(0, 10),
    vetName: s(l.vetName),
    birthCountry: l.birthCountry || 'United States',
    preconditioning: l.preconditioning,
    special: l.special,
    description: s(l.description),
    nutrition: s(l.nutrition),
    vaccinations: l.vaccinations.length ? l.vaccinations.map((v) => ({ key: rowKey++, date: s(v.date).slice(0, 10), product: v.product })) : [blankRow()],
    marketingMethod: l.marketingMethod,
    auctionName: s(l.auctionName),
    auctionNo: l.auctionNo,
    marketingDate: s(l.marketingDate).slice(0, 10),
    state: l.state,
    zip: s(l.zip),
    tagVisualStart: s(l.tagVisualStart),
    tagVisualEnd: s(l.tagVisualEnd),
    tagEidStart: s(l.tagEidStart),
    tagEidEnd: s(l.tagEidEnd),
    askingPrice: s(l.askingPrice),
    priceBasis: l.priceBasis ?? 'per_cwt',
    callForPrice: l.callForPrice,
    contactName: s(l.contactName),
    contactPhone: s(l.contactPhone),
    contactEmail: s(l.contactEmail),
  }
}

function toPayload(f: Form) {
  const auction = f.marketingMethod === 'auction' || f.marketingMethod === 'video_auction'
  return {
    groupId: f.groupId,
    groupIdOptout: f.groupIdOptout,
    steerCount: f.steerCount,
    heiferCount: f.heiferCount,
    avgWeightSteers: f.avgWeightSteers,
    avgWeightHeifers: f.avgWeightHeifers,
    breeds: f.breeds,
    breedMode: f.breedMode,
    breedAmounts: f.breedMode ? Object.fromEntries(f.breeds.map((b) => [b, f.breedAmounts[b] ?? ''])) : {},
    birthDate: f.birthDate,
    weanDate: f.weanDate,
    vetName: f.vetName,
    birthCountry: f.birthCountry,
    preconditioning: f.preconditioning,
    special: f.special,
    description: f.description,
    nutrition: f.nutrition,
    vaccinations: f.vaccinations.map((v) => ({ date: v.date, product: v.product })),
    marketingMethod: f.marketingMethod,
    auctionName: auction ? f.auctionName : '',
    auctionNo: auction && f.auctionNo != null ? f.auctionNo : '',
    marketingDate: f.marketingDate,
    state: f.state,
    zip: f.zip,
    tagVisualStart: f.tagVisualStart,
    tagVisualEnd: f.tagVisualEnd,
    tagEidStart: f.tagEidStart,
    tagEidEnd: f.tagEidEnd,
    askingPrice: f.askingPrice,
    priceBasis: f.priceBasis,
    callForPrice: f.callForPrice,
    contactName: f.contactName,
    contactPhone: f.contactPhone,
    contactEmail: f.contactEmail,
  }
}

export default function FeederForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState<Form>(() => blankForm(user?.displayName ?? '', user?.email ?? ''))
  const [breeds, setBreeds] = useState<string[]>([])
  const [pc, setPc] = useState<string[]>([])
  const [sp, setSp] = useState<string[]>([])
  const [countries, setCountries] = useState<string[]>(['United States'])
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
        const [b, p, q, c] = await Promise.all([getBreeds(), getPrograms('PC'), getPrograms('SP'), getCountries()])
        if (cancelled) return
        setBreeds(b.breeds)
        setPc(p.programs.map((x) => x.name))
        setSp(q.programs.map((x) => x.name))
        setCountries(c.countries)
      } catch {
        if (!cancelled) setBanner('The pick lists (breeds and programs) could not be loaded. Reload the page to try again.')
      }
      if (editing && id && token) {
        try {
          const r = await getCattleListing<FeederListing>('feeder', id, token)
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
      } else if (token) {
        try {
          const g = await getGroupId(token)
          if (!cancelled) setForm((f) => (f.groupId ? f : { ...f, groupId: g.groupId }))
        } catch {
          // the person can type their own identifier
        }
      }
      if (!cancelled) setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [editing, id, token, navigate])

  const total = (parseInt(form.steerCount, 10) || 0) + (parseInt(form.heiferCount, 10) || 0)
  const auction = form.marketingMethod === 'auction' || form.marketingMethod === 'video_auction'

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!token) return
    setBusy(true)
    setBanner('')
    setErrors({})
    try {
      const r = await saveCattleListing<FeederListing>('feeder', editing ? (id ?? null) : null, toPayload(form), token)
      const problems = await uploadDraft('feeder', r.listing.id, draft, token)
      if (problems.length > 0) {
        // The listing is saved. Go to its edit page so the files can be added again (not saved twice).
        navigate(`/list/feeder/${r.listing.id}/edit`, {
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
        <TextField id="groupId" label="Group Identifier" value={form.groupId} onChange={(v) => set('groupId', v)} error={errors.groupId} hint="Your last name and a number. Buyers see it on the listing." />
        <div className="flex items-end pb-1.5">
          <Check id="groupIdOptout" label="Don't show any ID" checked={form.groupIdOptout} onChange={(v) => set('groupIdOptout', v)} />
        </div>
        <Span cols={2}>{null}</Span>

        <TextField id="steerCount" label="Steers (head)" value={form.steerCount} onChange={(v) => set('steerCount', v.replace(/\D/g, ''))} error={errors.steerCount} inputMode="numeric" hint="Enter 0 if none." />
        <TextField id="avgWeightSteers" label="Average weight - steers (lbs)" value={form.avgWeightSteers} onChange={(v) => set('avgWeightSteers', v.replace(/\D/g, ''))} error={errors.avgWeightSteers} inputMode="numeric" />
        <TextField id="heiferCount" label="Heifers (head)" value={form.heiferCount} onChange={(v) => set('heiferCount', v.replace(/\D/g, ''))} error={errors.heiferCount} inputMode="numeric" />
        <TextField id="avgWeightHeifers" label="Average weight - heifers (lbs)" value={form.avgWeightHeifers} onChange={(v) => set('avgWeightHeifers', v.replace(/\D/g, ''))} error={errors.avgWeightHeifers} inputMode="numeric" />

        <TextField id="totalHead" label="Total head" value={String(total)} onChange={() => {}} readOnly hint="Steers plus heifers." />
        <MultiSelect id="breeds" label="Breed(s)" options={breeds} selected={form.breeds} onChange={(v) => set('breeds', v)} max={10} searchable error={errors.breeds} />
        <MultiSelect id="preconditioning" label="Preconditioning programs" options={pc} selected={form.preconditioning} onChange={(v) => set('preconditioning', v)} error={errors.preconditioning} />
        <MultiSelect id="special" label="Special programs" options={sp} selected={form.special} onChange={(v) => set('special', v)} error={errors.special} />

        <BreedMakeup
          breeds={form.breeds}
          mode={form.breedMode}
          amounts={form.breedAmounts}
          totalHead={total}
          error={errors.breedAmounts || errors.breedMode}
          onMode={(m) => set('breedMode', m)}
          onAmount={(b, v) => set('breedAmounts', { ...form.breedAmounts, [b]: v })}
        />

        <TextField id="birthDate" label="Birth date" type="date" value={form.birthDate} onChange={(v) => set('birthDate', v)} error={errors.birthDate} />
        <TextField id="weanDate" label="Wean date" type="date" value={form.weanDate} onChange={(v) => set('weanDate', v)} error={errors.weanDate} />
        <TextField id="vetName" label="Veterinarian" value={form.vetName} onChange={(v) => set('vetName', v)} error={errors.vetName} />
        <SelectField id="birthCountry" label="Country of birth" value={form.birthCountry} onChange={(v) => set('birthCountry', v)} error={errors.birthCountry} blank="Choose a country" options={countries.map((c) => [c, c])} />

        <Span>
          <TextArea id="description" label="Description" value={form.description} onChange={(v) => set('description', v)} error={errors.description} rows={4} />
        </Span>
      </Section>

      <MediaSection kind="feeder" listingId={editing ? (id ?? null) : null} token={token} photos={photos} docs={docs} onExisting={(a, b) => { setPhotos(a); setDocs(b) }} draft={draft} onDraft={setDraft} />

      <Section title="Vaccinations / Medications" hint="List each product given and the date. Leave blank if none.">
        <div className="col-span-full grid gap-4">
          {errors.vaccinations && (
            <p role="alert" className="text-sm text-destructive">
              {errors.vaccinations}
            </p>
          )}
          {form.vaccinations.map((row, i) => (
            <div key={row.key} className="grid items-start gap-4 sm:grid-cols-[12rem_1fr_auto]">
              <Field id={`vacDate${i}`} label={i === 0 ? 'Date given' : 'Date'}>
                <Input id={`vacDate${i}`} type="date" value={row.date} onChange={(e) => set('vaccinations', form.vaccinations.map((r) => (r.key === row.key ? { ...r, date: e.target.value } : r)))} />
              </Field>
              <Field id={`vacProduct${i}`} label={i === 0 ? 'Product' : 'Product'}>
                <ProductPicker id={`vacProduct${i}`} value={row.product} token={token} onChange={(v) => set('vaccinations', form.vaccinations.map((r) => (r.key === row.key ? { ...r, product: v } : r)))} />
              </Field>
              <div className="sm:pt-6">
                <Button type="button" variant="outline" size="sm" aria-label={`Remove vaccination row ${i + 1}`} onClick={() => set('vaccinations', form.vaccinations.length > 1 ? form.vaccinations.filter((r) => r.key !== row.key) : [blankRow()])}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
          <div>
            <Button type="button" variant="outline" size="sm" disabled={form.vaccinations.length >= 30} onClick={() => set('vaccinations', [...form.vaccinations, blankRow()])}>
              Add another
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Nutrition">
        <Span>
          <TextArea id="nutrition" label="Nutrition program" value={form.nutrition} onChange={(v) => set('nutrition', v)} error={errors.nutrition} rows={3} hint="Feed, mineral, grazing - whatever buyers should know." />
        </Span>
      </Section>

      <Section title="Marketing Information">
        <SelectField id="marketingMethod" label="Marketing method" value={form.marketingMethod} onChange={(v) => set('marketingMethod', v)} error={errors.marketingMethod} blank="Choose..." options={Object.entries(METHOD_LABELS)} />
        {auction ? (
          <AuctionPicker
            id="auctionName"
            label="Auction market"
            name={form.auctionName}
            token={token}
            error={errors.auctionName}
            onPick={(name, no) => setForm((f) => ({ ...f, auctionName: name, auctionNo: no }))}
          />
        ) : null}
        <TextField id="marketingDate" label="Marketing date" type="date" value={form.marketingDate} onChange={(v) => set('marketingDate', v)} error={errors.marketingDate} />
        <PlaceFields state={form.state} zip={form.zip} errors={errors} onState={(v) => set('state', v)} onZip={(v) => set('zip', v)} />
        <Span cols="full">
          <MarketInsightsButton zip={form.zip} />
        </Span>
      </Section>

      <Section title="Tag Information" hint="Optional. Only signed-in users see tag numbers.">
        <TextField id="tagVisualStart" label="Visual tag - first number" value={form.tagVisualStart} onChange={(v) => set('tagVisualStart', v)} error={errors.tagVisualStart} />
        <TextField id="tagVisualEnd" label="Visual tag - last number" value={form.tagVisualEnd} onChange={(v) => set('tagVisualEnd', v)} error={errors.tagVisualEnd} />
        <TextField id="tagEidStart" label="EID tag - first number" value={form.tagEidStart} onChange={(v) => set('tagEidStart', v)} error={errors.tagEidStart} />
        <TextField id="tagEidEnd" label="EID tag - last number" value={form.tagEidEnd} onChange={(v) => set('tagEidEnd', v)} error={errors.tagEidEnd} />
      </Section>

      <Section title="Price">
        <PriceFields askingPrice={form.askingPrice} priceBasis={form.priceBasis} callForPrice={form.callForPrice} withBasis errors={errors} onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))} />
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
