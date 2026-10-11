import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App'
import { niceMax } from '@/components/charts'

const staff = { id: '2', email: 's@x.com', displayName: 'Staff Person', membershipNumber: '1', membershipStatus: 'verified', role: 'staff' }
const member = { ...staff, id: '1', displayName: 'Member Person', role: 'member' }

const weeks = Array.from({ length: 12 }, (_, i) => ({ week: `2026-07-${String(20 + i).padStart(2, '0')}`, feeder: i === 11 ? 3 : 0, breeding: i === 11 ? 1 : 0 }))
const data = {
  generatedAt: '2026-10-11T17:00:00.000Z',
  listings: { feederLive: 7, breedingLive: 3, feederHead: 1200, breedingHead: 5, pending: 2, outcomes: { approved: 10, pending: 2, rejected: 1, sold: 4, withdrawn: 0 } },
  sex: { steers: 700, heifers: 500 },
  states: [
    { state: 'TX', feeder: 4, breeding: 1 },
    { state: 'OK', feeder: 3, breeding: 2 },
  ],
  weekly: weeks,
  attention: { pendingOverTwoDays: 1, noPhotos: 6, pastSaleDate: 0, notesOn: 2 },
  people: { members: 40, newThisWeek: 3, sellers: 9 },
  feedlots: { total: 785, enabled: 780, withEmail: 343, canEmail: 340, doNotEmail: 3, reach: { email: 340, faxOnly: 1, neither: 439 } },
  showlists: { sent: 0, lastAt: null, emailsSent: 0, delivered: 0, submitted: 0, failed: 0, unsubscribed: 0, feedlotsReached: 0 },
  barns: { total: 1317, active: 90, withEmail: 600, reach: { email: 70, faxOnly: 10, neither: 10 } },
}

function reply(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

function serve(role: 'visitor' | 'member' | 'staff', dash?: () => Promise<Response>) {
  if (role !== 'visitor') localStorage.setItem('raaaa_token', 'tok')
  const user = role === 'staff' ? staff : member
  const fn = vi.fn((url: string) => {
    if (url.startsWith('/api/auth/me')) return reply(200, { user })
    if (url.includes('pending-count')) return reply(200, { pending: 0 })
    if (url.startsWith('/api/dashboard')) return dash ? dash() : reply(200, { dashboard: data })
    return reply(404, { error: 'not_found' })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

function mount(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('staff dashboard', () => {
  it('shows the number tiles and the charts to staff', async () => {
    const fn = serve('staff')
    mount('/staff/dashboard')
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    await screen.findByText('Live feeder listings')
    const tile = (label: string) => within(screen.getByRole('main')).getAllByText(label)[0].closest('div,a') as HTMLElement
    expect(within(tile('Live feeder listings')).getByText('7')).toBeInTheDocument()
    expect(within(tile('Live feeder listings')).getByText('1,200 head')).toBeInTheDocument()
    expect(within(tile('Live breeding listings')).getByText('3')).toBeInTheDocument()
    expect(within(tile('Waiting for approval')).getByText('1 waiting over 2 days')).toBeInTheDocument()
    expect(within(tile('Sale barns')).getByText('1,317')).toBeInTheDocument()
    expect(within(tile('Feedlots')).getByText('785')).toBeInTheDocument()
    expect(within(tile('Showlists sent')).getByText('Nothing sent yet')).toBeInTheDocument()
    expect(within(tile('Datasheets sent to barns')).getByText('0')).toBeInTheDocument()
    for (const t of ['New listings per week', 'Live listings by state', 'Feeder cattle on offer', 'Listing outcomes', 'Who we can reach', 'Needs a look']) {
      expect(screen.getByRole('heading', { name: t })).toBeInTheDocument()
    }
    expect(screen.getByRole('img', { name: /new listings per week/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/^TX: Feeder 4, Breeding 1$/)).toBeInTheDocument()
    expect(fn.mock.calls.some((c) => c[0] === '/api/dashboard' && (c[1] as RequestInit).headers && ((c[1] as RequestInit).headers as Record<string, string>).Authorization === 'Bearer tok')).toBe(true)
  })

  it('lists Dashboard first in the Staff Tools menu', async () => {
    serve('staff')
    mount('/')
    fireEvent.click(await screen.findByRole('button', { name: /staff tools/i }))
    const items = screen.getAllByRole('menuitem').map((e) => e.textContent)
    expect(items[0]).toBe('Dashboard')
  })

  it('shows real showlist numbers once something was sent', async () => {
    serve('staff', () =>
      reply(200, { dashboard: { ...data, showlists: { ...data.showlists, sent: 2, emailsSent: 80, delivered: 70, failed: 4 } } }),
    )
    mount('/staff/dashboard')
    expect(await screen.findByText('80 emails - 70 delivered - 4 failed')).toBeInTheDocument()
  })

  it('says so when the sale barn numbers are not available', async () => {
    serve('staff', () => reply(200, { dashboard: { ...data, barns: null } }))
    mount('/staff/dashboard')
    expect(await screen.findByText('BlockTrust barn list not reachable')).toBeInTheDocument()
    expect(screen.getByText('Sale barn numbers are not available right now.')).toBeInTheDocument()
  })

  it('shows empty-state text and no broken charts when there is nothing yet', async () => {
    const empty = {
      ...data,
      listings: { ...data.listings, feederLive: 0, breedingLive: 0, feederHead: 0, breedingHead: 0, pending: 0, outcomes: { approved: 0, pending: 0, rejected: 0, sold: 0, withdrawn: 0 } },
      sex: { steers: 0, heifers: 0 },
      states: [],
    }
    serve('staff', () => reply(200, { dashboard: empty }))
    mount('/staff/dashboard')
    expect(await screen.findByText('No live listings yet.', { selector: 'p.text-sm' })).toBeInTheDocument()
    expect(screen.getByText('No live feeder listings yet.')).toBeInTheDocument()
    expect(screen.getByText('No listings yet.')).toBeInTheDocument()
  })

  it('shows an error with a working Refresh when the numbers cannot be loaded', async () => {
    let first = true
    serve('staff', () => {
      if (first) {
        first = false
        return reply(500, { error: 'server_error' })
      }
      return reply(200, { dashboard: data })
    })
    mount('/staff/dashboard')
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the dashboard')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(screen.getByText('Live feeder listings')).toBeInTheDocument())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('turns away members and does not ask the server for the numbers', async () => {
    const fn = serve('member')
    mount('/staff/dashboard')
    expect(await screen.findByRole('heading', { name: 'Staff only' })).toBeInTheDocument()
    expect(fn.mock.calls.some((c) => String(c[0]).startsWith('/api/dashboard'))).toBe(false)
  })

  it('shows the week readout when a column is focused', async () => {
    serve('staff')
    mount('/staff/dashboard')
    const col = await screen.findByLabelText('Jul 31: Feeder 3, Breeding 1')
    fireEvent.focus(col)
    expect(await screen.findByText(/Week of Jul 31:/)).toBeInTheDocument()
  })
})

describe('niceMax', () => {
  it('rounds the top of a chart to a clean number', () => {
    expect([0, 3, 4, 5, 7, 12, 23, 51, 101].map(niceMax)).toEqual([4, 4, 4, 5, 10, 20, 50, 100, 200])
  })
})
