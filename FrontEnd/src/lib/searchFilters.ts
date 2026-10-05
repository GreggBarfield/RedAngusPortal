import type { CattleKind, SearchParams } from '@/lib/api'
import { METHOD_LABELS, SEX_CLASS_LABELS, US_STATES, formatDate } from '@/lib/cattle'

// The search settings each screen keeps in its address (the same names the server and saved searches use).
const KEYS: Record<CattleKind, string[]> = {
  feeder: ['q', 'state', 'breed', 'program', 'method', 'dateFrom', 'dateTo', 'tagged', 'minWeight', 'maxWeight', 'minAge', 'maxAge', 'zip', 'miles', 'sort', 'dir'],
  breeding: ['q', 'state', 'breed', 'class', 'dateFrom', 'dateTo', 'epd', 'zip', 'miles', 'sort', 'dir'],
}
const MULTI = new Set(['breed', 'program', 'class', 'epd'])

export type FilterId = 'breed' | 'program' | 'class' | 'method' | 'date' | 'weight' | 'age' | 'tagged' | 'state' | 'miles' | 'epd'

export interface ChipDef {
  id: FilterId
  label: string
  keys: string[]
}

export const CHIPS: Record<CattleKind, ChipDef[]> = {
  feeder: [
    { id: 'breed', label: 'Breed', keys: ['breed'] },
    { id: 'program', label: 'Programs', keys: ['program'] },
    { id: 'method', label: 'Marketing Method', keys: ['method'] },
    { id: 'date', label: 'Marketing Date', keys: ['dateFrom', 'dateTo'] },
    { id: 'weight', label: 'Weight', keys: ['minWeight', 'maxWeight'] },
    { id: 'age', label: 'Age', keys: ['minAge', 'maxAge'] },
    { id: 'tagged', label: 'Tagged', keys: ['tagged'] },
    { id: 'state', label: 'State', keys: ['state'] },
    { id: 'miles', label: 'Within X miles', keys: ['zip', 'miles'] },
  ],
  breeding: [
    { id: 'breed', label: 'Breed', keys: ['breed'] },
    { id: 'class', label: 'Sex / Class', keys: ['class'] },
    { id: 'epd', label: 'EPDs', keys: ['epd'] },
    { id: 'date', label: 'Sale Date', keys: ['dateFrom', 'dateTo'] },
    { id: 'state', label: 'State', keys: ['state'] },
    { id: 'miles', label: 'Within X miles', keys: ['zip', 'miles'] },
  ],
}

export const SORT_OPTIONS: Record<CattleKind, [string, string][]> = {
  feeder: [
    ['newest:desc', 'Newest listed'],
    ['marketingDate:asc', 'Marketing date, soonest'],
    ['marketingDate:desc', 'Marketing date, latest'],
    ['headCount:desc', 'Most head'],
    ['weight:desc', 'Heaviest'],
    ['weight:asc', 'Lightest'],
    ['distance:asc', 'Closest'],
  ],
  breeding: [
    ['newest:desc', 'Newest listed'],
    ['saleDate:asc', 'Sale date, soonest'],
    ['saleDate:desc', 'Sale date, latest'],
    ['headCount:desc', 'Most head'],
    ['distance:asc', 'Closest'],
  ],
}
export const DEFAULT_SORT = 'newest:desc'

export function sortValue(p: URLSearchParams): string {
  const s = p.get('sort')
  if (!s) return DEFAULT_SORT
  return `${s}:${p.get('dir') === 'asc' ? 'asc' : 'desc'}`
}

export function withSort(p: URLSearchParams, value: string): URLSearchParams {
  const n = new URLSearchParams(p)
  n.delete('page')
  n.delete('sort')
  n.delete('dir')
  if (value !== DEFAULT_SORT) {
    const [s, d] = value.split(':')
    n.set('sort', s)
    n.set('dir', d)
  }
  return n
}

// Settings that count as filters (not the keyword or the sort).
export function filterKeysOf(kind: CattleKind): string[] {
  return KEYS[kind].filter((k) => k !== 'q' && k !== 'sort' && k !== 'dir')
}

export function hasFilters(kind: CattleKind, p: URLSearchParams): boolean {
  return filterKeysOf(kind).some((k) => p.has(k))
}

export function clearKeys(p: URLSearchParams, keys: string[]): URLSearchParams {
  const n = new URLSearchParams(p)
  n.delete('page')
  keys.forEach((k) => n.delete(k))
  return n
}

export function setKeys(p: URLSearchParams, values: Record<string, string | string[] | undefined>): URLSearchParams {
  const n = new URLSearchParams(p)
  n.delete('page')
  for (const [k, v] of Object.entries(values)) {
    n.delete(k)
    if (Array.isArray(v)) v.forEach((x) => x && n.append(k, x))
    else if (v) n.set(k, v)
  }
  return n
}

// What the server is asked for.
export function toApi(kind: CattleKind, p: URLSearchParams, page: number): SearchParams {
  const out: SearchParams = {}
  for (const k of KEYS[kind]) {
    if (k === 'dir') continue
    const v = MULTI.has(k) ? p.getAll(k) : p.get(k)
    if (Array.isArray(v) ? v.length : v) out[k] = v || undefined
  }
  if (out.sort && p.get('dir') === 'asc') out.dir = 'asc'
  if (out.sort && p.get('dir') !== 'asc') out.dir = 'desc'
  if (page > 1) out.page = String(page)
  return out
}

// What a saved search keeps.
export function toSaved(kind: CattleKind, p: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  for (const k of KEYS[kind]) {
    const v = MULTI.has(k) ? p.getAll(k) : p.get(k)
    if (Array.isArray(v) ? v.length : v) out[k] = v as string | string[]
  }
  return out
}

export function fromSaved(kind: CattleKind, params: Record<string, string | string[]>): URLSearchParams {
  const n = new URLSearchParams()
  for (const k of KEYS[kind]) {
    const v = params[k]
    if (Array.isArray(v)) v.forEach((x) => n.append(k, String(x)))
    else if (v != null && v !== '') n.set(k, String(v))
  }
  return n
}

export function parseEpd(s: string): { code: string; min: string; max: string } {
  const [code = '', min = '', max = ''] = s.split(':')
  return { code, min, max }
}

function range(a: string | null, b: string | null, unit: string): string | null {
  if (!a && !b) return null
  if (a && b) return `${a} to ${b}${unit}`
  return a ? `${a}+${unit}` : `up to ${b}${unit}`
}

// Short text shown inside a chip once it has a value.
export function chipSummary(id: FilterId, p: URLSearchParams): string | null {
  switch (id) {
    case 'breed': {
      const v = p.getAll('breed')
      return v.length ? (v.length > 2 ? `${v.length} chosen` : v.join(', ')) : null
    }
    case 'program': {
      const v = p.getAll('program')
      return v.length ? (v.length > 1 ? `${v.length} chosen` : v[0]) : null
    }
    case 'class': {
      const v = p.getAll('class').map((c) => SEX_CLASS_LABELS[c as keyof typeof SEX_CLASS_LABELS] ?? c)
      return v.length ? (v.length > 2 ? `${v.length} chosen` : v.join(', ')) : null
    }
    case 'method':
      return p.get('method') ? METHOD_LABELS[p.get('method') as keyof typeof METHOD_LABELS] ?? p.get('method') : null
    case 'date': {
      const a = p.get('dateFrom')
      const b = p.get('dateTo')
      if (!a && !b) return null
      return a && b ? `${formatDate(a)} - ${formatDate(b)}` : a ? `from ${formatDate(a)}` : `to ${formatDate(b)}`
    }
    case 'weight':
      return range(p.get('minWeight'), p.get('maxWeight'), ' lbs')
    case 'age':
      return range(p.get('minAge'), p.get('maxAge'), ' mo')
    case 'tagged':
      return p.get('tagged') ? 'Yes' : null
    case 'state': {
      const s = p.get('state')
      return s ? US_STATES.find(([c]) => c === s)?.[1] ?? s : null
    }
    case 'miles':
      return p.get('zip') && p.get('miles') ? `${p.get('miles')} mi of ${p.get('zip')}` : null
    case 'epd': {
      const v = p.getAll('epd')
      return v.length ? `${v.length} trait${v.length === 1 ? '' : 's'}` : null
    }
  }
}
