export interface HealthResponse {
  status: string
  service: string
  timestamp: string
}

export interface User {
  id: string
  email: string
  displayName: string
  membershipNumber: string
  membershipStatus: 'unverified' | 'verified' | 'rejected'
  role: 'member' | 'barn' | 'staff'
}

export interface AuthResponse {
  token: string
  user: User
}

export class ApiError extends Error {
  status: number
  code: string
  fields: Record<string, string>

  constructor(status: number, code: string, fields: Record<string, string> = {}) {
    super(code)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }
}

export class ConflictError extends ApiError {
  current: BarnContactValues
  conflicts: string[]

  constructor(current: BarnContactValues, conflicts: string[]) {
    super(409, 'conflict')
    this.name = 'ConflictError'
    this.current = current
    this.conflicts = conflicts
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (init.body) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(path, { ...init, headers })
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  if (!res.ok) {
    const body = (data ?? {}) as {
      error?: string
      fields?: Record<string, string>
      current?: BarnContactValues
      conflicts?: string[]
    }
    if (res.status === 409 && body.error === 'conflict' && body.current) {
      throw new ConflictError(body.current, body.conflicts ?? [])
    }
    throw new ApiError(res.status, body.error ?? 'request_failed', body.fields ?? {})
  }
  return data as T
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health')
  if (!res.ok) throw new Error(`Health check failed (${res.status})`)
  return (await res.json()) as HealthResponse
}

export interface RegisterInput {
  email: string
  password: string
  displayName: string
  membershipNumber: string
}

export function registerUser(input: RegisterInput): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/register', { method: 'POST', body: JSON.stringify(input) })
}

export function loginUser(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function getMe(token: string): Promise<{ user: User }> {
  return request<{ user: User }>('/api/auth/me', {}, token)
}

export interface BarnContactValues {
  email: string | null
  phone: string | null
  fax: string | null
  contactName: string | null
}

export interface Barn {
  auctionNo: number
  name: string
  city: string | null
  state: string | null
  category: 'REG' | 'VID'
  isActive: boolean
  // Only present when signed in:
  address?: string | null
  zip?: string | null
  email?: string | null
  phone?: string | null
  fax?: string | null
  contactName?: string | null
  btnPreferredMethod?: 'email' | 'fax' | null
  sendMethod?: 'email' | 'fax' | null
  enabled?: boolean
  // Only present for staff:
  notes?: string | null
}

export interface BarnList {
  total: number
  page: number
  pageSize: number
  barns: Barn[]
}

export interface BarnQuery {
  q?: string
  state?: string
  category?: string
  activeOnly?: boolean
  page?: number
}

export function listBarns(query: BarnQuery, token?: string | null): Promise<BarnList> {
  const p = new URLSearchParams()
  if (query.q) p.set('q', query.q)
  if (query.state) p.set('state', query.state)
  if (query.category) p.set('category', query.category)
  if (query.activeOnly) p.set('active', '1')
  if (query.page && query.page > 1) p.set('page', String(query.page))
  const qs = p.toString()
  return request<BarnList>('/api/barns' + (qs ? '?' + qs : ''), {}, token)
}

export function getBarnStates(): Promise<{ states: { state: string; n: number }[] }> {
  return request('/api/barns/states')
}

export function getBarn(id: number, token?: string | null): Promise<{ barn: Barn }> {
  return request<{ barn: Barn }>('/api/barns/' + id, {}, token)
}

export interface ContactChangeResult {
  changed: { field: string; oldValue: string | null; newValue: string | null }[]
  logged: boolean
}

export function saveBarnContact(
  id: number,
  changes: Partial<BarnContactValues>,
  expected: BarnContactValues,
  overwrite: boolean,
  token: string,
): Promise<ContactChangeResult> {
  return request<ContactChangeResult>(
    '/api/barns/' + id + '/contact',
    { method: 'PATCH', body: JSON.stringify({ changes, expected, overwrite }) },
    token,
  )
}

export interface BarnSettingsInput {
  sendMethod: 'email' | 'fax' | null
  enabled: boolean
  notes: string | null
}

export function saveBarnSettings(id: number, input: BarnSettingsInput, token: string) {
  return request<{ settings: BarnSettingsInput }>(
    '/api/barns/' + id + '/settings',
    { method: 'PUT', body: JSON.stringify(input) },
    token,
  )
}

export interface BarnLogEntry {
  id: string
  field: 'email' | 'phone' | 'fax' | 'contactName'
  oldValue: string | null
  newValue: string | null
  overwrote: boolean
  changedAt: string
  changedBy: string
}

export function getBarnLog(id: number, token: string): Promise<{ log: BarnLogEntry[] }> {
  return request<{ log: BarnLogEntry[] }>('/api/barns/' + id + '/log', {}, token)
}

// ---------------------------------------------------------------------------
// Cattle listings (feeder and breeding), pick lists from BTN, saved searches
// ---------------------------------------------------------------------------

export type ListingStatus = 'pending' | 'approved' | 'rejected' | 'sold' | 'withdrawn'
export type CattleKind = 'feeder' | 'breeding'
export type MarketingMethod = 'auction' | 'off_ranch' | 'video_auction'
export type SaleType = 'auction' | 'private_treaty' | 'off_ranch' | 'video_auction'
export type SexClass = 'bull' | 'open_heifer' | 'bred_heifer' | 'cow' | 'cow_calf' | 'embryo_semen'
export type BreedClass = 'purebred' | 'percentage' | 'composite' | 'commercial'
export type PriceBasis = 'per_cwt' | 'per_head'

export interface Vaccination {
  date: string | null
  product: string
}

export interface EpdValue {
  trait: string
  value: number | null
  unknown: boolean
}

interface ListingCommon {
  id: string
  headline: string
  description: string | null
  city: string | null
  state: string
  askingPrice: number | null
  callForPrice: boolean
  status: ListingStatus
  approvedAt: string | null
  createdAt: string
  distanceMiles?: number
  // Signed-in users:
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  sellerName?: string
  mine?: boolean
  // Owner and staff:
  zip?: string
  reviewNote?: string | null
  updatedAt?: string
}

export interface FeederListing extends ListingCommon {
  groupId: string | null
  steerCount: number
  heiferCount: number
  headCount: number
  avgWeightSteers: number | null
  avgWeightHeifers: number | null
  avgWeight: number | null
  birthDate: string | null
  ageMonths: number | null
  weanDate: string | null
  daysWeaned: number | null
  vetName: string | null
  birthCountry: string
  nutrition: string | null
  breeds: string[]
  preconditioning: string[]
  special: string[]
  vaccinations: Vaccination[]
  marketingMethod: MarketingMethod
  auctionNo: number | null
  auctionName: string | null
  marketingDate: string
  priceBasis: PriceBasis | null
  // Signed-in users:
  tagVisualStart?: string | null
  tagVisualEnd?: string | null
  tagEidStart?: string | null
  tagEidEnd?: string | null
  // Owner and staff:
  groupIdOptout?: boolean
}

export interface BreedingListing extends ListingCommon {
  headCount: number
  sexClass: SexClass
  birthDate: string | null
  ageMonths: number | null
  regNumber: string | null
  breeds: string[]
  breedClass: BreedClass | null
  primaryBreed: string | null
  sire: string | null
  dam: string | null
  saleTitle: string | null
  saleType: SaleType
  auctionNo: number | null
  auctionName: string | null
  saleDate: string
  epds: EpdValue[]
}

export interface ListingPage<T> {
  total: number
  page: number
  pageSize: number
  listings: T[]
}

export type ListingInput = Record<string, unknown>

export type SearchParams = Record<string, string | string[] | undefined>

export function toQuery(params: SearchParams): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => x && p.append(k, x))
    else if (v) p.set(k, v)
  }
  const qs = p.toString()
  return qs ? '?' + qs : ''
}

const BASE: Record<CattleKind, string> = { feeder: '/api/feeder-listings', breeding: '/api/breeding-listings' }

export function searchListings<T>(kind: CattleKind, params: SearchParams, token?: string | null): Promise<ListingPage<T>> {
  return request<ListingPage<T>>(BASE[kind] + toQuery(params), {}, token)
}

export function getCattleListing<T>(kind: CattleKind, id: string, token?: string | null): Promise<{ listing: T }> {
  return request<{ listing: T }>(`${BASE[kind]}/${encodeURIComponent(id)}`, {}, token)
}

export function getMyCattleListings<T>(kind: CattleKind, token: string): Promise<{ listings: T[] }> {
  return request<{ listings: T[] }>(`${BASE[kind]}/mine`, {}, token)
}

export function saveCattleListing<T>(kind: CattleKind, id: string | null, input: ListingInput, token: string): Promise<{ listing: T }> {
  const url = id ? `${BASE[kind]}/${encodeURIComponent(id)}` : BASE[kind]
  return request<{ listing: T }>(url, { method: id ? 'PUT' : 'POST', body: JSON.stringify(input) }, token)
}

export function closeCattleListing(kind: CattleKind, id: string, status: 'sold' | 'withdrawn', token: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    `${BASE[kind]}/${encodeURIComponent(id)}/close`,
    { method: 'POST', body: JSON.stringify({ status }) },
    token,
  )
}

export function getCattleQueue<T>(kind: CattleKind, status: 'pending' | 'approved' | 'rejected', token: string): Promise<{ listings: T[] }> {
  return request<{ listings: T[] }>(`${BASE[kind]}/queue?status=${status}`, {}, token)
}

export function getCattlePendingCount(kind: CattleKind, token: string): Promise<{ pending: number }> {
  return request<{ pending: number }>(`${BASE[kind]}/pending-count`, {}, token)
}

export function reviewCattleListing(kind: CattleKind, id: string, decision: 'approve' | 'reject', note: string, token: string) {
  return request<{ ok: boolean }>(
    `${BASE[kind]}/${encodeURIComponent(id)}/review`,
    { method: 'POST', body: JSON.stringify({ decision, note }) },
    token,
  )
}

// Pick lists (read live from BTN by the server)
export interface Program {
  name: string
  type: 'PC' | 'SP'
  image: string | null
}
export interface EpdTrait {
  code: string
  name: string
  unit: string | null
  description: string | null
}
export interface VaccineProduct {
  id: number
  name: string
  company: string | null
}
export interface AuctionMarket {
  id: number
  auctionNo: number | null
  name: string
  zip: string | null
}
export interface ZipInfo {
  zip: string
  city: string
  state: string
  lat: number
  lon: number
}

export const getBreeds = () => request<{ breeds: string[] }>('/api/ref/breeds')
export const getPrograms = (type: 'PC' | 'SP') => request<{ programs: Program[] }>('/api/ref/programs?type=' + type)
export const getEpdTraits = () => request<{ traits: EpdTrait[] }>('/api/ref/epd-traits')
export const getCountries = () => request<{ countries: string[] }>('/api/ref/countries')
export const getVaccineProducts = (q: string) => request<{ products: VaccineProduct[] }>('/api/ref/vaccine-products?q=' + encodeURIComponent(q))
export const getAuctions = (q: string) => request<{ auctions: AuctionMarket[] }>('/api/ref/auctions?q=' + encodeURIComponent(q))
export const getZip = (zip: string) => request<ZipInfo>('/api/ref/zip/' + encodeURIComponent(zip))
export const getGroupId = (token: string) => request<{ groupId: string }>('/api/ref/group-id', {}, token)

export function addVaccineProduct(name: string, company: string | null, token: string) {
  return request<{ product: VaccineProduct; created: boolean }>(
    '/api/ref/vaccine-products',
    { method: 'POST', body: JSON.stringify({ name, company }) },
    token,
  )
}

export function addAuction(name: string, zip: string | null, token: string) {
  return request<{ auction: AuctionMarket; created: boolean }>(
    '/api/ref/auctions',
    { method: 'POST', body: JSON.stringify({ name, zip }) },
    token,
  )
}

// Saved searches
export interface SavedFilter {
  id: string
  kind: CattleKind
  name: string
  params: Record<string, string | string[]>
}
export const getSavedFilters = (kind: CattleKind, token: string) =>
  request<{ filters: SavedFilter[] }>('/api/saved-filters?kind=' + kind, {}, token)
export const saveFilter = (kind: CattleKind, name: string, params: Record<string, string | string[]>, token: string) =>
  request<{ filter: SavedFilter }>('/api/saved-filters', { method: 'POST', body: JSON.stringify({ kind, name, params }) }, token)
export const deleteFilter = (id: string, token: string) =>
  request<{ ok: boolean }>('/api/saved-filters/' + encodeURIComponent(id), { method: 'DELETE' }, token)
