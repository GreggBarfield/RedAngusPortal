import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App'

const staff = {
  id: '2',
  email: 's@x.com',
  displayName: 'Staff Person',
  membershipNumber: '1',
  membershipStatus: 'verified',
  role: 'staff',
}
const member = { ...staff, id: '1', email: 'm@x.com', displayName: 'Member Ranch', role: 'member' }

const lot = {
  id: '9',
  title: '60 black-red steer calves',
  headCount: 60,
  sex: 'steers',
  avgWeight: 550,
  weightLow: 500,
  weightHigh: 600,
  breed: '75% Red Angus',
  ageMonths: 7,
  weaned: true,
  weanedDays: 45,
  healthProgram: 'Two rounds of shots',
  hornStatus: 'polled',
  bunkBroke: true,
  siredBy: null,
  saleType: 'private_treaty',
  availableDate: '2026-11-15',
  city: 'Bryan',
  state: 'TX',
  priceBasis: 'per_cwt',
  askingPrice: 1.85,
  callForPrice: false,
  description: null,
  status: 'approved',
  approvedAt: null,
  createdAt: '2026-10-01',
}
const full = { ...lot, contactName: 'Sam', contactPhone: '979-555-0100', contactEmail: 'sam@x.com', sellerName: 'Sam Ranch', mine: false }

function reply(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
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

describe('feeder search', () => {
  it('shows lots with price per cwt to a visitor, no phone', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply(200, { total: 1, page: 1, pageSize: 20, lots: [lot] })))
    mount('/feeders')
    expect(await screen.findByRole('link', { name: '60 black-red steer calves' })).toBeInTheDocument()
    expect(screen.getByText('$1.85 per cwt')).toBeInTheDocument()
    expect(screen.getByText(/550 lb avg \(500-600\)/)).toBeInTheDocument()
    expect(screen.queryByText(/979-555/)).toBeNull()
  })

  it('sends the search words and weight range', async () => {
    const f = vi.fn(() => reply(200, { total: 0, page: 1, pageSize: 20, lots: [] }))
    vi.stubGlobal('fetch', f)
    mount('/feeders')
    await waitFor(() => expect(f).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'angus' } })
    fireEvent.change(screen.getByLabelText('Min lb'), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() =>
      expect(f.mock.calls.some((c) => String(c[0]).includes('q=angus') && String(c[0]).includes('minWeight=500'))).toBe(true),
    )
  })
})

describe('feeder detail', () => {
  it('asks a visitor to sign in for contact', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply(200, { lot })))
    mount('/feeders/9')
    expect(await screen.findByRole('heading', { name: '60 black-red steer calves' })).toBeInTheDocument()
    expect(screen.getByText(/to see the seller/i)).toBeInTheDocument()
    expect(screen.getByText('Yes, 45 days')).toBeInTheDocument()
  })

  it('a signed-in buyer sees the phone but no edit buttons', async () => {
    localStorage.setItem('raaaa_token', 'tok')
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => (url.startsWith('/api/auth/me') ? reply(200, { user: member }) : reply(200, { lot: full }))),
    )
    mount('/feeders/9')
    expect(await screen.findByText('979-555-0100')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
  })

  it('the owner can mark it sold', async () => {
    localStorage.setItem('raaaa_token', 'tok')
    const closes: unknown[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.startsWith('/api/auth/me')) return reply(200, { user: member })
        if (url.endsWith('/close')) {
          closes.push(JSON.parse(String(init?.body)))
          return reply(200, { ok: true })
        }
        return reply(200, { lot: { ...full, mine: true, zip: '77801', reviewNote: null } })
      }),
    )
    mount('/feeders/9')
    expect(await screen.findByRole('link', { name: 'Edit' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mark sold' }))
    await waitFor(() => expect(closes).toEqual([{ status: 'sold' }]))
  })
})

describe('feeder form', () => {
  it('fills contact, hides weaned days until weaned, shows server errors', async () => {
    localStorage.setItem('raaaa_token', 'tok')
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.startsWith('/api/auth/me')) return reply(200, { user: member })
        if (init?.method === 'POST') return reply(400, { error: 'validation', fields: { title: 'Enter a title.' } })
        return reply(404, {})
      }),
    )
    mount('/feeders/new')
    expect(await screen.findByLabelText('Contact name')).toHaveValue('Member Ranch')
    expect(screen.queryByLabelText('Days weaned')).toBeNull()
    fireEvent.click(screen.getByLabelText('Weaned'))
    expect(screen.getByLabelText('Days weaned')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
    expect(await screen.findByText('Enter a title.')).toBeInTheDocument()
  })

  it('sends flags and goes to My listings, where the lot shows', async () => {
    localStorage.setItem('raaaa_token', 'tok')
    const posts: Record<string, unknown>[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.startsWith('/api/auth/me')) return reply(200, { user: member })
        if (url === '/api/feeders' && init?.method === 'POST') {
          posts.push(JSON.parse(String(init.body)))
          return reply(201, { lot: { ...full, mine: true } })
        }
        if (url.startsWith('/api/feeders/mine')) return reply(200, { lots: [{ ...full, status: 'pending' }] })
        return reply(200, { listings: [] })
      }),
    )
    mount('/feeders/new')
    await screen.findByLabelText('Contact name')
    fireEvent.click(screen.getByLabelText('Call for price'))
    fireEvent.click(screen.getByLabelText('Bunk broke'))
    fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
    expect(await screen.findByRole('heading', { name: 'My listings' })).toBeInTheDocument()
    expect(posts[0]).toMatchObject({ callForPrice: true, bunkBroke: true, weaned: false })
    expect(await screen.findByText('Feeder lots')).toBeInTheDocument()
    expect(screen.getByText('Waiting for approval')).toBeInTheDocument()
  })
})

describe('feeder staff review', () => {
  it('members are told it is staff only', async () => {
    localStorage.setItem('raaaa_token', 'tok')
    vi.stubGlobal('fetch', vi.fn((url: string) => (url.startsWith('/api/auth/me') ? reply(200, { user: member }) : reply(403, {}))))
    mount('/staff/review-feeders')
    expect(await screen.findByText('Staff only')).toBeInTheDocument()
  })

  it('staff approve, and rejecting needs a reason', async () => {
    localStorage.setItem('raaaa_token', 'tok')
    const reviews: unknown[] = []
    let queue = [{ ...full, status: 'pending' }]
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.startsWith('/api/auth/me')) return reply(200, { user: staff })
        if (url.includes('pending-count')) return reply(200, { pending: queue.length })
        if (url.endsWith('/review')) {
          reviews.push(JSON.parse(String(init?.body)))
          queue = []
          return reply(200, { ok: true })
        }
        return reply(200, { lots: queue })
      }),
    )
    mount('/staff/review-feeders')
    expect(await screen.findByRole('link', { name: '60 black-red steer calves' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('Tell the seller why.')).toBeInTheDocument()
    expect(reviews).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(reviews).toEqual([{ decision: 'approve', note: '' }]))
    expect(await screen.findByText('Nothing here.')).toBeInTheDocument()
  })
})
