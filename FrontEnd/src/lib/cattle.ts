import type { BreedClass, ListingStatus, MarketingMethod, PriceBasis, SaleType, SexClass } from '@/lib/api'

export const STATUS_LABELS: Record<ListingStatus, string> = {
  pending: 'Waiting for approval',
  approved: 'Live',
  rejected: 'Not approved',
  sold: 'Sold',
  withdrawn: 'Withdrawn',
}

export const METHOD_LABELS: Record<MarketingMethod, string> = {
  auction: 'Auction',
  off_ranch: 'Off Ranch',
  video_auction: 'Video Auction',
}

export const SALE_TYPE_LABELS: Record<SaleType, string> = {
  auction: 'Auction',
  private_treaty: 'Private Treaty',
  off_ranch: 'Off Ranch',
  video_auction: 'Video Auction',
}

export const SEX_CLASS_LABELS: Record<SexClass, string> = {
  bull: 'Bull',
  open_heifer: 'Open Heifer',
  bred_heifer: 'Bred Heifer',
  cow: 'Cow',
  cow_calf: 'Cow/Calf Pair',
  embryo_semen: 'Embryo/Semen',
}

export const BREED_CLASS_LABELS: Record<BreedClass, string> = {
  purebred: 'Purebred',
  percentage: 'Percentage',
  composite: 'Composite',
  commercial: 'Commercial',
}

export const BASIS_LABELS: Record<PriceBasis, string> = {
  per_cwt: 'per cwt',
  per_head: 'per head',
}

export const US_STATES: [string, string][] = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'],
  ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'],
  ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
  ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'],
  ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'],
  ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'],
  ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'],
  ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
  ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
]

export function formatDate(d: string | null | undefined): string {
  if (!d) return ''
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${m}/${day}/${y}`
}

export function formatPrice(l: { askingPrice: number | null; callForPrice: boolean; priceBasis?: PriceBasis | null }): string {
  if (l.callForPrice) return 'Call for price'
  if (l.askingPrice == null) return 'Price not listed'
  const money = '$' + l.askingPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return l.priceBasis ? `${money} ${BASIS_LABELS[l.priceBasis]}` : money
}

export function placeText(l: { city: string | null; state: string }): string {
  return l.city ? `${l.city}, ${l.state}` : l.state
}
