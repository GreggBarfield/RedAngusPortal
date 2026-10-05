import { Link } from 'react-router-dom'
import { Row } from '@/components/Page'
import type { BreedingListing, CattleKind, FeederListing } from '@/lib/api'
import { BREED_CLASS_LABELS, METHOD_LABELS, SALE_TYPE_LABELS, SEX_CLASS_LABELS, formatDate, formatPrice, placeText } from '@/lib/cattle'

type Any = FeederListing | BreedingListing

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t pt-3">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <dl className="grid gap-1.5">{children}</dl>
    </section>
  )
}

function FeederFacts({ l }: { l: FeederListing }) {
  const weight = [l.avgWeightSteers && `steers ${l.avgWeightSteers} lbs`, l.avgWeightHeifers && `heifers ${l.avgWeightHeifers} lbs`].filter(Boolean).join(', ')
  return (
    <>
      <Group title="Basic Information">
        <Row label="Group" value={l.groupId} />
        <Row label="Steers" value={l.steerCount} />
        <Row label="Heifers" value={l.heiferCount} />
        <Row label="Total head" value={l.headCount} />
        <Row label="Average weight" value={weight} />
        <Row label="Breeds" value={l.breeds.join(', ')} />
        <Row label="Age" value={l.ageMonths != null ? `${l.ageMonths} months` : null} />
        <Row label="Days weaned" value={l.daysWeaned} />
        <Row label="Preconditioning" value={l.preconditioning.join(', ')} />
        <Row label="Special programs" value={l.special.join(', ')} />
      </Group>
      <Group title="Marketing Information">
        <Row label="Method" value={METHOD_LABELS[l.marketingMethod]} />
        <Row label="Auction market" value={l.auctionName} />
        <Row label="Marketing date" value={formatDate(l.marketingDate)} />
      </Group>
      {l.vaccinations.length > 0 && (
        <section className="border-t pt-3">
          <h3 className="mb-2 text-sm font-semibold">Vaccinations / Medications</h3>
          <ul className="grid gap-1 text-sm">
            {l.vaccinations.map((v, i) => (
              <li key={i}>
                {v.date ? <span className="text-muted-foreground">{formatDate(v.date)} - </span> : null}
                {v.product}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function BreedingFacts({ l }: { l: BreedingListing }) {
  return (
    <>
      <Group title="Basic Information">
        <Row label="Number of head" value={l.headCount} />
        <Row label="Sex / class" value={SEX_CLASS_LABELS[l.sexClass]} />
        <Row label="Age" value={l.ageMonths != null ? `${l.ageMonths} months` : null} />
        <Row label="Registration" value={l.regNumber} />
        <Row label="Breeds" value={l.breeds.join(', ')} />
        <Row label="Breed class" value={l.breedClass ? BREED_CLASS_LABELS[l.breedClass] : null} />
        <Row label="Sire" value={l.sire} />
        <Row label="Dam" value={l.dam} />
      </Group>
      {l.epds.length > 0 && (
        <Group title="EPDs">
          {l.epds.map((e) => (
            <Row key={e.trait} label={e.trait} value={e.unknown || e.value == null ? 'Unknown' : String(e.value)} />
          ))}
        </Group>
      )}
      <Group title="Sale Information">
        <Row label="Sale title" value={l.saleTitle} />
        <Row label="Sale type" value={SALE_TYPE_LABELS[l.saleType]} />
        <Row label="Auction market" value={l.auctionName} />
        <Row label="Sale date" value={formatDate(l.saleDate)} />
      </Group>
    </>
  )
}

// The listing picked in the results, shown beside them (wide screens) without leaving the search.
export default function ListingPanel({ kind, listing, signedIn }: { kind: CattleKind; listing: Any | null; signedIn: boolean }) {
  if (!listing) {
    return (
      <aside aria-label="Selected listing" className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        Choose a listing to see its details here.
      </aside>
    )
  }
  const l = listing
  return (
    <aside aria-label="Selected listing" className="grid max-h-[calc(100vh-6rem)] gap-3 overflow-y-auto rounded-lg border bg-card p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold leading-snug">{l.headline}</h2>
        <p className="text-sm text-muted-foreground">
          {placeText(l)}
          {l.distanceMiles != null ? ` (${l.distanceMiles} miles)` : ''}
        </p>
        <p className="mt-1 text-lg font-semibold">{formatPrice(l)}</p>
      </div>
      {l.description && <p className="whitespace-pre-line text-sm">{l.description}</p>}
      {kind === 'feeder' ? <FeederFacts l={l as FeederListing} /> : <BreedingFacts l={l as BreedingListing} />}
      <Group title="Seller">
        {signedIn ? (
          <>
            <Row label="Contact" value={l.contactName} />
            <Row label="Phone" value={l.contactPhone} />
            <Row label="Email" value={l.contactEmail} />
          </>
        ) : (
          <p className="text-sm">
            <Link to="/login" className="text-primary underline">
              Sign in
            </Link>{' '}
            to see the seller&apos;s phone and email.
          </p>
        )}
      </Group>
      <Link to={`/${kind}/${l.id}`} className="text-sm font-medium text-primary underline">
        Open the full listing
      </Link>
    </aside>
  )
}
