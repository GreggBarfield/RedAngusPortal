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
    const body = (data ?? {}) as { error?: string; fields?: Record<string, string> }
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
