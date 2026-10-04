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

export type ListingKind = 'bull' | 'cow' | 'heifer' | 'bred_heifer' | 'pair'
export type ListingStatus = 'pending' | 'approved' | 'rejected' | 'sold' | 'withdrawn'

export interface Listing {
  id: string
  kind: ListingKind
  name: string
  regNumber: string | null
  birthDate: string
  sireName: string | null
  sireReg: string | null
  damName: string | null
  damReg: string | null
  birthWeight: number | null
  weaningWeight: number | null
  yearlingWeight: number | null
  scrotal: number | null
  bredTo: string | null
  dueDate: string | null
  headCount: number
  city: string
  state: string
  askingPrice: number | null
  callForPrice: boolean
  description: string | null
  status: ListingStatus
  approvedAt: string | null
  createdAt: string
  // Signed-in users:
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  sellerName?: string
  mine?: boolean
  // Owner and staff:
  tag?: string | null
  zip?: string
  reviewNote?: string | null
  updatedAt?: string
}

export interface ListingList {
  total: number
  page: number
  pageSize: number
  listings: Listing[]
}

export interface ListingQuery {
  q?: string
  kind?: string
  state?: string
  page?: number
}

export function listListings(query: ListingQuery, token?: string | null): Promise<ListingList> {
  const p = new URLSearchParams()
  if (query.q) p.set('q', query.q)
  if (query.kind) p.set('kind', query.kind)
  if (query.state) p.set('state', query.state)
  if (query.page && query.page > 1) p.set('page', String(query.page))
  const qs = p.toString()
  return request<ListingList>('/api/listings' + (qs ? '?' + qs : ''), {}, token)
}

export function getListing(id: string, token?: string | null): Promise<{ listing: Listing }> {
  return request<{ listing: Listing }>('/api/listings/' + encodeURIComponent(id), {}, token)
}

export function getMyListings(token: string): Promise<{ listings: Listing[] }> {
  return request<{ listings: Listing[] }>('/api/listings/mine', {}, token)
}

export type ListingInput = Record<string, string | boolean>

export function createListing(input: ListingInput, token: string): Promise<{ listing: Listing }> {
  return request<{ listing: Listing }>('/api/listings', { method: 'POST', body: JSON.stringify(input) }, token)
}

export function updateListing(id: string, input: ListingInput, token: string): Promise<{ listing: Listing }> {
  return request<{ listing: Listing }>(
    '/api/listings/' + encodeURIComponent(id),
    { method: 'PUT', body: JSON.stringify(input) },
    token,
  )
}

export function closeListing(id: string, status: 'sold' | 'withdrawn', token: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    '/api/listings/' + encodeURIComponent(id) + '/close',
    { method: 'POST', body: JSON.stringify({ status }) },
    token,
  )
}

export function getReviewQueue(status: 'pending' | 'approved' | 'rejected', token: string): Promise<{ listings: Listing[] }> {
  return request<{ listings: Listing[] }>('/api/listings/queue?status=' + status, {}, token)
}

export function getPendingCount(token: string): Promise<{ pending: number }> {
  return request<{ pending: number }>('/api/listings/pending-count', {}, token)
}

export function reviewListing(id: string, decision: 'approve' | 'reject', note: string, token: string) {
  return request<{ ok: boolean }>(
    '/api/listings/' + encodeURIComponent(id) + '/review',
    { method: 'POST', body: JSON.stringify({ decision, note }) },
    token,
  )
}
