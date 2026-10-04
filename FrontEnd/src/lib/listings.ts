import type { Listing, ListingKind, ListingStatus } from '@/lib/api'

export const KIND_LABELS: Record<ListingKind, string> = {
  bull: 'Bull',
  cow: 'Cow',
  heifer: 'Open heifer',
  bred_heifer: 'Bred heifer',
  pair: 'Cow-calf pair',
}

export const STATUS_LABELS: Record<ListingStatus, string> = {
  pending: 'Waiting for approval',
  approved: 'Live',
  rejected: 'Not approved',
  sold: 'Sold',
  withdrawn: 'Withdrawn',
}

export function formatPrice(l: Pick<Listing, 'askingPrice' | 'callForPrice'>): string {
  if (l.callForPrice) return 'Call for price'
  if (l.askingPrice == null) return 'Price not listed'
  return '$' + l.askingPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

export function formatDate(d: string | null): string {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y}`
}
