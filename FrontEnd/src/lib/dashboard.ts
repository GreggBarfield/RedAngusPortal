import { ApiError } from '@/lib/api'

// The staff dashboard numbers (GET /api/dashboard, staff only).
export interface Reach {
  email: number
  faxOnly: number
  neither: number
}

export interface DashboardData {
  generatedAt: string
  listings: {
    feederLive: number
    breedingLive: number
    feederHead: number
    breedingHead: number
    pending: number
    outcomes: { approved: number; pending: number; rejected: number; sold: number; withdrawn: number }
  }
  sex: { steers: number; heifers: number }
  states: { state: string; feeder: number; breeding: number }[]
  weekly: { week: string; feeder: number; breeding: number }[]
  attention: { pendingOverTwoDays: number; noPhotos: number; pastSaleDate: number; notesOn: number }
  people: { members: number; newThisWeek: number; sellers: number }
  feedlots: { total: number; enabled: number; withEmail: number; canEmail: number; doNotEmail: number; reach: Reach }
  showlists: {
    sent: number
    lastAt: string | null
    emailsSent: number
    delivered: number
    submitted: number
    failed: number
    unsubscribed: number
    feedlotsReached: number
  }
  // null when BlockTrust's barn list could not be read
  barns: { total: number; active: number; withEmail: number; reach: Reach } | null
}

export async function getDashboard(token: string): Promise<{ dashboard: DashboardData }> {
  const res = await fetch('/api/dashboard', { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } })
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? 'request_failed')
  return data as { dashboard: DashboardData }
}
