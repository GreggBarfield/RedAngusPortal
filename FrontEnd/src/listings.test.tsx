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

const base = {
  id: '5',
  kind: 'bull',
  name: 'Big Red 12',
  regNumber: 'RAA 123',
  birthDate: '2025-02-10',
  sireName: null,
  sireReg: null,
  damName: null,
  damReg: null,
  birthWeight: null,
  weaningWeight: null,
  yearlingWeight: null,
  scrotal: null,
  bredTo: null,
  dueDate: null,
  headCount: 1,
  city: 'Bryan',
  state: 'TX',
  askingPrice: 5000,
  callForPrice: false,
  description: null,
  status: 'approved',
  approvedAt: null,
  createdAt: '2026-10-01',
}
const full = { ...base, contactName: 'Sam', contactPhone: '979-555-0100', contactEmail: 'sam@x.com', sellerName: 'Sam Ranch' }

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

describe('cattle search', () => {
  it('shows listings and price to a visitor, no phone', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply(200, { total: 1, page: 1, pageSize: 20, listings: [base] })))
    mount('/listings')
    expect(await screen.findByRole('link', { name: 'Big Red 12' })).toBeInTheDocument()
    expect(screen.getByText(/\$5,000/)).toBeInTheDocument()
    expect(screen.queryByText(/979-555/)).toBeNull()
  })

  it('sends the search words', async () => {
    const f = vi.fn(() => reply(200, { total: 0, page: 1, pageSize: 20, listings: [] }))
    vi.stubGlobal('fetch', f)
    mount('/listings')
    await waitFor(() => expect(f).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'angus' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(f.mock.calls.some((c) => String(c[0]).includes('q=angus'))).toBe(true))
  })
})

describe('listing detail', () => {
  it('asks a visitor to sign in for contact', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply(200, { listing: base })))
    mount('/listings/5')
    expect(await screen.findByRole('heading', { name: 'Big Red 12' })).toBeInTheDocument()
    expect(screen.getByText(/to see the seller/i)).toBeInTheDocument()
  })

  it('a signed-in buyer sees the phone but no edit buttons', async () => {
    localStorage.setItem('raaaa_token', 'tok')
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => (url.startsWith('/api/auth/me') ? reply(200, { user: member }) : reply(200, { listing: full }))),
    )
    mount('/listings/5')
    expect(await screen.findByText('979-555-0100')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
  })

  it('the owner can edit and mark sold', async () => {
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
        return reply(200, { listing: { ...full, mine: true, tag: '12', zip: '77801', reviewNote: null } })
      }),
    )
    mount('/listings/5')
    expect(await screen.findByRole('link', { name: 'Edit' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mark sold' }))
    await waitFor(() => expect(closes).toEqual([{ status: 'sold' }]))
  })
})

describe('listing form', () => {
  it('needs sign in', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply(401, { error: 'unauthorized' })))
    mount('/listings/new')
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })

  it('shows bull-only fields only for bulls, fills contact, shows server errors', async () => {
    localStorage.setItem('raaaa_token', 'tok')
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.startsWith('/api/auth/me')) return reply(200, { user: member })
        if (init?.method === 'POST') return reply(400, { error: 'validation', fields: { name: 'Enter a name.' } })
        return reply(404, {})
      }),
    )
    mount('/listings/new')
    expect(await screen.findByLabelText('Contact name')).toHaveValue('Member Ranch')
    expect(screen.getByLabelText('Email')).toHaveValue('m@x.com')
    expect(screen.queryByLabelText(/scrotal/i)).toBeNull()
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'bull' } })
    expect(screen.getByLabelText(/scrotal/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Bred to')).toBeNull()
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'cow' } })
    expect(screen.getByLabelText('Bred to')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
    expect(await screen.findByText('Enter a name.')).toBeInTheDocument()
  })

  it('sends call for price and goes to My listings', async () => {
    localStorage.setItem('raaaa_token', 'tok')
    const posts: Record<string, unknown>[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.startsWith('/api/auth/me')) return reply(200, { user: member })
        if (init?.method === 'POST') {
          posts.push(JSON.parse(String(init.body)))
          return reply(201, { listing: { ...full, mine: true } })
        }
        return reply(200, { listings: [{ ...full, status: 'pending' }] })
      }),
    )
    mount('/listings/new')
    await screen.findByLabelText('Contact name')
    fireEvent.click(screen.getByLabelText('Call for price'))
    fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
    expect(await screen.findByRole('heading', { name: 'My listings' })).toBeInTheDocument()
    expect(posts[0].callForPrice).toBe(true)
    expect(await screen.findByText('Waiting for approval')).toBeInTheDocument()
  })
})

describe('staff review', () => {
  it('members are told it is staff only', async () => {
    localStorage.setItem('raaaa_token', 'tok')
    vi.stubGlobal('fetch', vi.fn((url: string) => (url.startsWith('/api/auth/me') ? reply(200, { user: member }) : reply(403, {}))))
    mount('/staff/review')
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
        if (url.startsWith('/api/listings/pending-count')) return reply(200, { pending: queue.length })
        if (url.endsWith('/review')) {
          reviews.push(JSON.parse(String(init?.body)))
          queue = []
          return reply(200, { ok: true })
        }
        return reply(200, { listings: queue })
      }),
    )
    mount('/staff/review')
    expect(await screen.findByRole('link', { name: 'Big Red 12' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('Tell the seller why.')).toBeInTheDocument()
    expect(reviews).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(reviews).toEqual([{ decision: 'approve', note: '' }]))
    expect(await screen.findByText('Nothing here.')).toBeInTheDocument()
  })

  it('nav shows the waiting count to staff', async () => {
    localStorage.setItem('raaaa_token', 'tok')
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.startsWith('/api/auth/me')) return reply(200, { user: staff })
        if (url.startsWith('/api/listings/pending-count')) return reply(200, { pending: 3 })
        return reply(200, { listings: [] })
      }),
    )
    mount('/')
    expect(await screen.findByRole('link', { name: 'Review (3)' })).toBeInTheDocument()
  })
})
