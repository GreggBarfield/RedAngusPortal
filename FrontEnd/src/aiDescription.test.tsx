import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App'
import { listingNotes } from '@/lib/cattle'

const member = { id: '1', email: 'm@x.com', displayName: 'Member Ranch', membershipNumber: '1', membershipStatus: 'verified', role: 'member' }
const staff = { ...member, id: '2', email: 's@x.com', displayName: 'Staff Person', role: 'staff' }

const NOTES = 'Sixty head of Red Angus calves.\n\nWeaned 45 days.'

const feeder = {
  id: '9',
  groupId: 'G100',
  headline: '40 steers and 20 heifers - Red Angus, 583 lbs',
  steerCount: 40,
  heiferCount: 20,
  headCount: 60,
  avgWeightSteers: 600,
  avgWeightHeifers: 550,
  avgWeight: 583,
  birthDate: null,
  ageMonths: 7,
  weanDate: null,
  daysWeaned: null,
  vetName: null,
  birthCountry: 'United States',
  description: null,
  nutrition: null,
  breeds: ['Red Angus'],
  preconditioning: [],
  special: [],
  vaccinations: [],
  marketingMethod: 'off_ranch',
  auctionNo: null,
  auctionName: null,
  marketingDate: '2026-11-15',
  city: 'College Station',
  state: 'TX',
  priceBasis: 'per_cwt',
  askingPrice: 1.85,
  callForPrice: false,
  status: 'approved',
  createdAt: '2026-10-01',
  aiDescription: NOTES,
}

type Handler = (url: string, init?: RequestInit) => [number, unknown] | null
let calls: { url: string; init?: RequestInit }[] = []

function stubApi(handlers: Handler[], who: typeof member | null = member) {
  calls = []
  const base: Handler = (url) => {
    if (url.startsWith('/api/auth/me')) return who ? [200, { user: who }] : [401, { error: 'unauthorized' }]
    if (url.startsWith('/api/ref/breeds')) return [200, { breeds: ['Red Angus'] }]
    if (url.startsWith('/api/ref/programs')) return [200, { programs: [] }]
    if (url.startsWith('/api/ref/countries')) return [200, { countries: ['United States'] }]
    if (url.startsWith('/api/ref/group-id')) return [200, { groupId: 'MEMBER100' }]
    if (url.startsWith('/api/ref/vaccine-products')) return [200, { products: [] }]
    if (url.startsWith('/api/ref/auctions')) return [200, { auctions: [] }]
    if (url.includes('pending-count')) return [200, { pending: 0 }]
    return null
  }
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init })
      for (const h of [...handlers, base]) {
        const r = h(url, init)
        if (r) return Promise.resolve(new Response(JSON.stringify(r[1]), { status: r[0] }))
      }
      return Promise.resolve(new Response(JSON.stringify({ error: 'not_found' }), { status: 404 }))
    }),
  )
}

function mount(path: string) {
  localStorage.setItem('raaaa_token', 'tok')
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

const writeCall = () => calls.find((c) => c.url === '/api/feeder-listings/ai-description')
const aiRoute = (status: number, body: unknown): Handler => (u, i) => (u === '/api/feeder-listings/ai-description' && i?.method === 'POST' ? [status, body] : null)

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('listingNotes helper', () => {
  it('returns the text only when there is some and the seller has not switched it off', () => {
    expect(listingNotes({ aiDescription: ' Hello ' })).toBe('Hello')
    expect(listingNotes({ aiDescription: 'Hello', includeAi: true })).toBe('Hello')
    expect(listingNotes({ aiDescription: 'Hello', includeAi: false })).toBeNull()
    expect(listingNotes({ aiDescription: '   ' })).toBeNull()
    expect(listingNotes({ aiDescription: null })).toBeNull()
    expect(listingNotes({})).toBeNull()
  })
})

describe('Listing Notes on the form', () => {
  it('has the section, the button and an unticked box that cannot be ticked while empty', async () => {
    stubApi([])
    mount('/list/feeder')
    expect(await screen.findByRole('heading', { name: 'Listing Notes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Write it for me' })).toBeInTheDocument()
    const box = screen.getByLabelText('Show these notes on my listing and the data sheet')
    expect(box).not.toBeChecked()
    expect(box).toBeDisabled()
  })

  it('Write it for me fills the text, ticks the box and turns into Rewrite', async () => {
    stubApi([aiRoute(200, { text: NOTES })])
    mount('/list/feeder')
    fireEvent.change(await screen.findByLabelText('Steers (head)'), { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: 'Write it for me' }))
    await waitFor(() => expect(screen.getByLabelText('Listing notes')).toHaveValue(NOTES))
    expect(screen.getByLabelText('Show these notes on my listing and the data sheet')).toBeChecked()
    expect(screen.getByRole('button', { name: 'Rewrite' })).toBeInTheDocument()
    expect(JSON.parse(String(writeCall()?.init?.body)).steerCount).toBe('40')
    expect(writeCall()?.init?.headers).toMatchObject({ Authorization: 'Bearer tok' })
  })

  it('shows a plain message for each kind of failure and keeps what the seller typed', async () => {
    const cases: [number, RegExp][] = [
      [400, /number of steers and heifers/],
      [503, /not available/],
      [429, /limit for writing notes/],
      [500, /could not be written/],
    ]
    for (const [status, text] of cases) {
      stubApi([aiRoute(status, { error: 'x' })])
      const { unmount } = mount('/list/feeder')
      const area = await screen.findByLabelText('Listing notes')
      fireEvent.change(area, { target: { value: 'My own words.' } })
      fireEvent.click(screen.getByRole('button', { name: 'Rewrite' }))
      expect(await screen.findByText(text)).toBeInTheDocument()
      expect(screen.getByLabelText('Listing notes')).toHaveValue('My own words.')
      unmount()
      localStorage.clear()
    }
  })

  it('typing your own text lets you tick the box; clearing the text unticks it', async () => {
    stubApi([])
    mount('/list/feeder')
    const area = await screen.findByLabelText('Listing notes')
    const box = screen.getByLabelText('Show these notes on my listing and the data sheet')
    fireEvent.change(area, { target: { value: 'Just mine.' } })
    expect(box).not.toBeDisabled()
    fireEvent.click(box)
    expect(box).toBeChecked()
    fireEvent.change(area, { target: { value: '' } })
    expect(box).not.toBeChecked()
    expect(box).toBeDisabled()
  })

  it('an edit loads the saved text and box, and the save sends both', async () => {
    const mine = { ...feeder, includeAi: true, mine: true, contactName: 'Sam', contactPhone: '979-555-0100', contactEmail: 'sam@x.com', zip: '77845' }
    stubApi([
      (u, i) => (u === '/api/feeder-listings/9' && !i?.method ? [200, { listing: mine }] : null),
      (u, i) => (u === '/api/feeder-listings/9' && i?.method === 'PUT' ? [200, { listing: mine }] : null),
      (u) => (u.includes('/mine') ? [200, { listings: [] }] : null),
    ])
    mount('/list/feeder/9/edit')
    await waitFor(() => expect(screen.getByLabelText('Listing notes')).toHaveValue(NOTES))
    expect(screen.getByLabelText('Show these notes on my listing and the data sheet')).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByRole('heading', { name: 'My listings' })
    const put = calls.find((c) => c.init?.method === 'PUT')
    expect(JSON.parse(String(put?.init?.body))).toMatchObject({ aiDescription: NOTES, includeAi: true })
  })
})

describe('Listing Notes on the screens', () => {
  it('the listing page shows the notes with their paragraphs', async () => {
    stubApi([(u) => (u === '/api/feeder-listings/9' ? [200, { listing: feeder }] : null)])
    mount('/feeder/9')
    expect(await screen.findByRole('heading', { name: 'Listing Notes' })).toBeInTheDocument()
    expect(screen.getByText(/Sixty head of Red Angus calves\./)).toBeInTheDocument()
  })

  it('the listing page shows no section when there are no notes', async () => {
    stubApi([(u) => (u === '/api/feeder-listings/9' ? [200, { listing: { ...feeder, aiDescription: null } }] : null)])
    mount('/feeder/9')
    await screen.findByRole('heading', { name: feeder.headline })
    expect(screen.queryByRole('heading', { name: 'Listing Notes' })).toBeNull()
  })

  it('the review queue shows the notes to staff', async () => {
    const waiting = { ...feeder, status: 'pending', contactName: 'Sam', contactPhone: '1', contactEmail: 'a@x.com', sellerName: 'Sam' }
    stubApi(
      [
        (u) => (u.startsWith('/api/feeder-listings/queue') ? [200, { listings: [waiting] }] : null),
        (u) => (u.startsWith('/api/breeding-listings/queue') ? [200, { listings: [] }] : null),
      ],
      staff,
    )
    mount('/staff/review')
    expect(await screen.findByText('Listing Notes')).toBeInTheDocument()
    expect(screen.getByText(/Weaned 45 days\./)).toBeInTheDocument()
  })
})
