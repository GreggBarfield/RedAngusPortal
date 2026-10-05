import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DocumentList, PhotoGallery, hasDocuments } from '@/components/Media'
import { Page, Row } from '@/components/Page'
import { ApiError, closeCattleListing, getCattleListing } from '@/lib/api'
import type { BreedingListing, CattleKind, FeederListing } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { BREED_CLASS_LABELS, breedText, METHOD_LABELS, SALE_TYPE_LABELS, SEX_CLASS_LABELS, STATUS_LABELS, formatDate, formatPrice, placeText } from '@/lib/cattle'

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="border-b bg-muted/50 py-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 pt-4">{children}</CardContent>
    </Card>
  )
}

function FeederBody({ l }: { l: FeederListing }) {
  const tags = [l.tagVisualStart && `Visual ${l.tagVisualStart}${l.tagVisualEnd ? ' to ' + l.tagVisualEnd : ''}`, l.tagEidStart && `EID ${l.tagEidStart}${l.tagEidEnd ? ' to ' + l.tagEidEnd : ''}`].filter(Boolean).join(' - ')
  const weight = [l.avgWeightSteers && `steers ${l.avgWeightSteers} lbs`, l.avgWeightHeifers && `heifers ${l.avgWeightHeifers} lbs`].filter(Boolean).join(', ')
  return (
    <>
      <Block title="Basic Information">
        <dl className="grid gap-2">
          <Row label="Group" value={l.groupId} />
          <Row label="Steers" value={l.steerCount} />
          <Row label="Heifers" value={l.heiferCount} />
          <Row label="Total head" value={l.headCount} />
          <Row label="Average weight" value={weight} />
          <Row label="Breeds" value={breedText(l)} />
          <Row label="Birth date" value={formatDate(l.birthDate)} />
          <Row label="Age" value={l.ageMonths != null ? `${l.ageMonths} months` : null} />
          <Row label="Wean date" value={formatDate(l.weanDate)} />
          <Row label="Days weaned" value={l.daysWeaned} />
          <Row label="Veterinarian" value={l.vetName} />
          <Row label="Country of birth" value={l.birthCountry} />
          <Row label="Preconditioning" value={l.preconditioning.join(', ')} />
          <Row label="Special programs" value={l.special.join(', ')} />
        </dl>
        {l.description && <p className="mt-2 whitespace-pre-line text-sm">{l.description}</p>}
      </Block>
      {l.vaccinations.length > 0 && (
        <Block title="Vaccinations / Medications">
          <ul className="grid gap-1 text-sm">
            {l.vaccinations.map((v, i) => (
              <li key={i}>
                {v.date ? <span className="text-muted-foreground">{formatDate(v.date)} - </span> : null}
                {v.product}
              </li>
            ))}
          </ul>
        </Block>
      )}
      {l.nutrition && (
        <Block title="Nutrition">
          <p className="whitespace-pre-line text-sm">{l.nutrition}</p>
        </Block>
      )}
      <Block title="Marketing Information">
        <dl className="grid gap-2">
          <Row label="Marketing method" value={METHOD_LABELS[l.marketingMethod]} />
          <Row label="Auction market" value={l.auctionName} />
          <Row label="Marketing date" value={formatDate(l.marketingDate)} />
          <Row label="Location" value={placeText(l)} />
          <Row label="Price" value={formatPrice(l)} />
        </dl>
      </Block>
      {tags && (
        <Block title="Tag Information">
          <p className="text-sm">{tags}</p>
        </Block>
      )}
    </>
  )
}

function BreedingBody({ l }: { l: BreedingListing }) {
  return (
    <>
      <Block title="Basic Information">
        <dl className="grid gap-2">
          <Row label="Number of head" value={l.headCount} />
          <Row label="Sex / class" value={SEX_CLASS_LABELS[l.sexClass]} />
          <Row label="Date of birth" value={formatDate(l.birthDate)} />
          <Row label="Age" value={l.ageMonths != null ? `${l.ageMonths} months` : null} />
          <Row label="Registration number" value={l.regNumber} />
          <Row label="Breeds" value={l.breeds.join(', ')} />
          <Row label="Breed class" value={l.breedClass ? BREED_CLASS_LABELS[l.breedClass] : null} />
          <Row label="Primary breed" value={l.primaryBreed} />
          <Row label="Sire" value={l.sire} />
          <Row label="Dam" value={l.dam} />
        </dl>
        {l.description && <p className="mt-2 whitespace-pre-line text-sm">{l.description}</p>}
      </Block>
      {l.epds.length > 0 && (
        <Block title="EPDs">
          <dl className="grid gap-2">
            {l.epds.map((e) => (
              <Row key={e.trait} label={e.trait} value={e.unknown || e.value == null ? 'Unknown' : String(e.value)} />
            ))}
          </dl>
        </Block>
      )}
      <Block title="Sale Information">
        <dl className="grid gap-2">
          <Row label="Sale title" value={l.saleTitle} />
          <Row label="Sale type" value={SALE_TYPE_LABELS[l.saleType]} />
          <Row label="Auction market" value={l.auctionName} />
          <Row label="Sale date" value={formatDate(l.saleDate)} />
          <Row label="Location" value={placeText(l)} />
          <Row label="Price" value={formatPrice(l)} />
        </dl>
      </Block>
    </>
  )
}

export default function CattleDetail({ kind }: { kind: CattleKind }) {
  const { id = '' } = useParams()
  const { user, token, loading: authLoading } = useAuth()
  const [listing, setListing] = useState<FeederListing | BreedingListing | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const searchPath = `/search/${kind}`

  const load = useCallback(async () => {
    try {
      const r = await getCattleListing<FeederListing | BreedingListing>(kind, id, token)
      setListing(r.listing)
      setNotFound(false)
      setError('')
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true)
      else setError('Could not load this listing. Try again.')
    }
  }, [kind, id, token])

  useEffect(() => {
    if (authLoading) return
    void load()
  }, [load, authLoading])

  async function close(status: 'sold' | 'withdrawn') {
    if (!token) return
    setBusy(true)
    try {
      await closeCattleListing(kind, id, status, token)
      await load()
    } catch {
      setError('Could not update the listing. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (notFound) {
    return (
      <Page>
        <h1 className="text-2xl font-semibold">Listing not found</h1>
        <p className="mt-2 text-muted-foreground">It may have been sold, withdrawn or not approved yet.</p>
        <p className="mt-2">
          <Link to={searchPath} className="text-primary underline">
            Back to the search
          </Link>
        </p>
      </Page>
    )
  }
  if (!listing) {
    return error ? (
      <p role="alert" className="px-6 py-16 text-center text-destructive">
        {error}
      </p>
    ) : (
      <p className="px-6 py-16 text-center text-sm text-muted-foreground">Loading...</p>
    )
  }

  const mine = listing.mine === true
  const canEdit = mine && listing.status !== 'sold' && listing.status !== 'withdrawn'

  return (
    <Page>
      <p className="text-sm">
        <Link to={searchPath} className="text-primary underline">
          {kind === 'feeder' ? 'All feeder cattle for sale' : 'All breeding cattle for sale'}
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{listing.headline}</h1>
        {listing.status !== 'approved' && <Badge variant={listing.status === 'rejected' ? 'destructive' : 'secondary'}>{STATUS_LABELS[listing.status]}</Badge>}
      </div>
      <p className="mt-1 text-muted-foreground">{placeText(listing)}</p>
      <p className="mt-2 text-xl font-semibold">{formatPrice(listing)}</p>

      {mine && listing.reviewNote && (
        <Card className="mt-4 border-destructive">
          <CardContent className="py-3 text-sm">
            <span className="font-medium">Note from the reviewer:</span> {listing.reviewNote}
          </CardContent>
        </Card>
      )}

      {canEdit && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link to={`/list/${kind}/${listing.id}/edit`}>Edit</Link>
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void close('sold')}>
            Mark sold
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void close('withdrawn')}>
            Withdraw
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="grid gap-6">
          {(listing.photos ?? []).length > 0 && <PhotoGallery key={listing.id} photos={listing.photos} />}
          {kind === 'feeder' ? <FeederBody l={listing as FeederListing} /> : <BreedingBody l={listing as BreedingListing} />}
          {hasDocuments(listing, !!user) && (
            <Block title="Documents">
              <DocumentList kind={kind} listing={listing} />
            </Block>
          )}
        </div>
        <Block title="Seller">
          {user ? (
            <dl className="grid gap-2">
              <Row label="Contact" value={listing.contactName} />
              <Row label="Phone" value={listing.contactPhone} />
              <Row label="Email" value={listing.contactEmail} />
              {mine && <Row label="Zip code" value={listing.zip} />}
            </dl>
          ) : (
            <p className="text-sm">
              <Link to="/login" state={{ from: `/${kind}/${listing.id}` }} className="text-primary underline">
                Sign in
              </Link>{' '}
              to see the seller&apos;s phone, email and tag numbers.
            </p>
          )}
        </Block>
      </div>
    </Page>
  )
}
