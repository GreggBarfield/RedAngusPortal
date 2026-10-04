import type { FeederLot, FeederSex, HornStatus, PriceBasis, SaleType } from '@/lib/api'

export const SEX_LABELS: Record<FeederSex, string> = {
  steers: 'Steers',
  heifers: 'Heifers',
  bulls: 'Bull calves',
  mixed: 'Mixed',
}

export const HORN_LABELS: Record<HornStatus, string> = {
  polled: 'Polled',
  dehorned: 'Dehorned',
  horned: 'Horned',
  mixed: 'Mixed',
}

export const SALE_LABELS: Record<SaleType, string> = {
  private_treaty: 'Private treaty',
  contract: 'Contract',
  video: 'Video sale',
}

export const BASIS_LABELS: Record<PriceBasis, string> = {
  per_cwt: 'per cwt',
  per_head: 'per head',
}

export function formatFeederPrice(l: Pick<FeederLot, 'askingPrice' | 'callForPrice' | 'priceBasis'>): string {
  if (l.callForPrice) return 'Call for price'
  if (l.askingPrice == null || !l.priceBasis) return 'Price not listed'
  return '$' + l.askingPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + BASIS_LABELS[l.priceBasis]
}

export function weightText(l: Pick<FeederLot, 'avgWeight' | 'weightLow' | 'weightHigh'>): string {
  const base = `${l.avgWeight} lb avg`
  if (l.weightLow != null && l.weightHigh != null) return `${base} (${l.weightLow}-${l.weightHigh})`
  return base
}
