import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App'

const staff = { id: '2', email: 's@x.com', displayName: 'Staff Person', membershipNumber: '1', membershipStatus: 'verified', role: 'staff' }
const member = { ...staff, id: '1', email: 'm@x.com', displayName: 'Member Ranch', role: 'member' }

const feeder = {
  id: '9',
  groupId: 'BARFIELD100',
  headline: '40 steers and 20 heifers - Red Angus, 583 lbs',
  steerCount: 40,
  heiferCount: 20,
  headCount: 60,
  avgWeightSteers: 600,
  avgWeightHeifers: 550,
  avgWeight: 583,
  birthDate: '2026-03-01',
  ageMonths: 7,
  weanDate: null,
  daysWeaned: null,
  vetName: null,
  birthCountry: 'United States',
  description: 'Home raised.',
  nutrition: null,
  breeds: ['Red Angus'],
  preconditioning: ['Weaned 45 Days'],
  special: [],
  vaccinations: [{ date: '2026-08-01', product: 'Bovi-Shield Gold 5' }],
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
  approvedAt: null,
  createdAt: '2026-10-01',
}
const feederMember = { ...feeder, tagVisualStart: 'V100', tagVisualEnd: 'V160', contactName: 'Sam', contactPhone: '979-555-0100', contactEmail: 'sam@x.com', sellerName: 'Sam Ranch', mine: false }
const breeding = {
  id: '4',
  headline: '3 Red Angus Bulls',
  headCount: 3,
  sexClass: 'bull',
  birthDate: null,
  ageMonths: null,
  regNumber: 'RA123',
  breeds: ['Red Angus'],
  breedClass: 'purebred',
  primaryBreed: 'Red Angus',
  sire: 'Big Sire',
  dam: null,
  description: null,
  saleTitle: null,
  saleType: 'private_treaty',
  auctionNo: null,
  auctionName: null,
  saleDate: '2026-11-15',
  city: 'Bryan',
  state: 'TX',
  askingPrice: null,
  callForPrice: true,
  epds: [{ trait: 'BW', value: 1.5, unknown: false }, { trait: 'WW', value: null, unknown: true }],
  status: 'approved',
  approvedAt: null,
  createdAt: '2026-10-01',
}

type Handler = (url: string, init?: RequestInit) => [number, unknown] | null
let calls: { url: string; init?: RequestInit }[] = []

function stubApi(handlers: Handler[], who: typeof member | null = member) {
  calls = []
  const base: Handler = (url) => {
    if (url.startsWith('/api/auth/me')) return who ? [200, { user: who }] : [401, { error: 'unauthorized' }]
    if (url.startsWith('/api/ref/breeds')) return [200, { breeds: ['Red Angus', 'Angus', 'Hereford'] }]
    if (url.startsWith('/api/ref/programs?type=PC')) return [200, { programs: [{ name: 'Weaned 45 Days', type: 'PC', image: null }] }]
    if (url.startsWith('/api/ref/programs?type=SP')) return [200, { programs: [{ name: 'Non-Hormone', type: 'SP', image: null }] }]
    if (url.startsWith('/api/ref/countries')) return [200, { countries: ['United States', 'Canada'] }]
    if (url.startsWith('/api/ref/epd-traits')) return [200, { traits: [{ code: 'BW', name: 'Birth Weight', unit: 'lb', description: null }, { code: 'WW', name: 'Weaning Weight', unit: 'lb', description: null }] }]
    if (url.startsWith('/api/ref/group-id')) return [200, { groupId: 'MEMBER100' }]
    if (url.startsWith('/api/ref/zip/77845')) return [200, { zip: '77845', city: 'College Station', state: 'TX', lat: 30.6, lon: -96.3 }]
    if (url.startsWith('/api/ref/vaccine-products')) return [200, { products: [{ id: 1, name: 'Bovi-Shield Gold 5', company: 'Zoetis' }] }]
    if (url.startsWith('/api/ref/auctions')) return [200, { auctions: [{ id: 1, auctionNo: 12, name: 'Bryan Livestock', zip: '77801' }] }]
    if (url.includes('pending-count')) return [200, { pending: 2 }]
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

function mount(path: string, who: typeof member | null = member) {
  if (who) localStorage.setItem('raaaa_token', 'tok')
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}
const post = () => calls.find((c) => c.init?.method === 'POST' || c.init?.method === 'PUT')
const body = () => JSON.parse(String(post()?.init?.body))

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('tabs', () => {
  it('Search For Cattle opens on Feeder Cattle with both tabs', async () => {
    stubApi([(u) => (u.startsWith('/api/feeder-listings') ? [200, { total: 0, page: 1, pageSize: 20, listings: [] }] : null)], null)
    mount('/search/feeder', null)
    expect(await screen.findByRole('heading', { name: 'Search For Cattle' })).toBeInTheDocument()
    const tabs = screen.getByRole('navigation', { name: 'Kind of cattle' })
    expect(within(tabs).getByRole('link', { name: 'Feeder Cattle' })).toHaveAttribute('aria-current', 'page')
    expect(within(tabs).getByRole('link', { name: 'Breeding Cattle' })).toHaveAttribute('href', '/search/breeding')
  })

  it('List Your Cattle opens on the feeder form, and /list goes there', async () => {
    stubApi([])
    mount('/list')
    expect(await screen.findByRole('heading', { name: 'List Your Cattle' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Basic Information' })).toBeInTheDocument()
    expect(screen.getByLabelText('Steers (head)')).toBeInTheDocument()
  })

  it('a visitor who is not signed in is sent to sign in', async () => {
    stubApi([], null)
    mount('/list/feeder', null)
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })
})

describe('feeder listing form', () => {
  it('has the BlockTrust sections, full width', async () => {
    stubApi([])
    mount('/list/feeder')
    for (const name of ['Basic Information', 'Vaccinations / Medications', 'Nutrition', 'Marketing Information', 'Tag Information', 'Price', 'Contact']) {
      expect(await screen.findByRole('heading', { name })).toBeInTheDocument()
    }
    const main = screen.getByRole('heading', { name: 'List Your Cattle' }).closest('main')!
    expect(main.className).toContain('max-w-[1600px]')
    expect(main.className).not.toContain('max-w-2xl')
  })

  it('fills in the group identifier, contact name and email', async () => {
    stubApi([])
    mount('/list/feeder')
    await waitFor(() => expect(screen.getByLabelText('Group Identifier')).toHaveValue('MEMBER100'))
    expect(screen.getByLabelText('Contact name')).toHaveValue('Member Ranch')
    expect(screen.getByLabelText('Contact email')).toHaveValue('m@x.com')
  })

  it('adds up the total head', async () => {
    stubApi([])
    mount('/list/feeder')
    fireEvent.change(await screen.findByLabelText('Steers (head)'), { target: { value: '40' } })
    fireEvent.change(screen.getByLabelText('Heifers (head)'), { target: { value: '20' } })
    expect(screen.getByLabelText('Total head')).toHaveValue('60')
  })

  it('shows the auction market box only for auction methods', async () => {
    stubApi([])
    mount('/list/feeder')
    const method = await screen.findByLabelText('Marketing method')
    expect(screen.queryByLabelText('Auction market')).toBeNull()
    fireEvent.change(method, { target: { value: 'auction' } })
    expect(screen.getByLabelText('Auction market')).toBeInTheDocument()
    fireEvent.change(method, { target: { value: 'off_ranch' } })
    expect(screen.queryByLabelText('Auction market')).toBeNull()
  })

  it('only takes breeds from the list', async () => {
    stubApi([])
    mount('/list/feeder')
    const box = await screen.findByLabelText('Breed(s)')
    fireEvent.change(box, { target: { value: 'Martian Cow' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(screen.getByText('Choose a breed from the list.')).toBeInTheDocument()
    fireEvent.change(box, { target: { value: 'red angus' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(screen.getByRole('list', { name: /chosen/i })).toHaveTextContent('Red Angus')
  })

  it('looks up the zip and fills in the state and city', async () => {
    stubApi([])
    mount('/list/feeder')
    fireEvent.change(await screen.findByLabelText('Zip code'), { target: { value: '77845' } })
    expect(await screen.findByText('Location: College Station, TX')).toBeInTheDocument()
    expect(screen.getByLabelText('State')).toHaveValue('TX')
  })

  it('adds and removes vaccination rows', async () => {
    stubApi([])
    mount('/list/feeder')
    await screen.findByRole('heading', { name: 'Vaccinations / Medications' })
    expect(screen.getAllByLabelText(/^Product/)).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Add another' }))
    expect(screen.getAllByLabelText(/^Product/)).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Remove vaccination row 2' }))
    expect(screen.getAllByLabelText(/^Product/)).toHaveLength(1)
  })

  it('"Add Product Not Listed" sends the new product to the BTN list and uses it', async () => {
    stubApi([(u, i) => (u === '/api/ref/vaccine-products' && i?.method === 'POST' ? [201, { product: { id: 9, name: 'Zed Shot 9', company: 'Acme' }, created: true }] : null)])
    mount('/list/feeder')
    const product = await screen.findByLabelText('Product')
    fireEvent.change(product, { target: { value: 'Zed Shot 9' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Add Product Not Listed' }, { timeout: 3000 }))
    const group = screen.getByRole('group', { name: 'Add Product Not Listed' })
    fireEvent.change(within(group).getByLabelText('Company (optional)'), { target: { value: 'Acme' } })
    fireEvent.click(within(group).getByRole('button', { name: 'Add to the list' }))
    await waitFor(() => expect(calls.some((c) => c.url === '/api/ref/vaccine-products' && c.init?.method === 'POST')).toBe(true))
    expect(JSON.parse(String(calls.find((c) => c.init?.method === 'POST')!.init!.body))).toEqual({ name: 'Zed Shot 9', company: 'Acme' })
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Add Product Not Listed' })).toBeNull())
    expect(screen.getByLabelText('Product')).toHaveValue('Zed Shot 9')
  })

  it('submits everything, then shows the saved note on My listings', async () => {
    stubApi([
      (u, i) => (u === '/api/feeder-listings' && i?.method === 'POST' ? [201, { listing: feeder }] : null),
      (u) => (u.startsWith('/api/feeder-listings/mine') || u.startsWith('/api/breeding-listings/mine') ? [200, { listings: [] }] : null),
    ])
    mount('/list/feeder')
    await waitFor(() => expect(screen.getByLabelText('Group Identifier')).toHaveValue('MEMBER100'))
    fireEvent.change(screen.getByLabelText('Steers (head)'), { target: { value: '40' } })
    fireEvent.change(screen.getByLabelText('Heifers (head)'), { target: { value: '20' } })
    const box = screen.getByLabelText('Breed(s)')
    fireEvent.change(box, { target: { value: 'Red Angus' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    fireEvent.click(screen.getByLabelText('Weaned 45 Days'))
    fireEvent.change(screen.getByLabelText('Marketing method'), { target: { value: 'off_ranch' } })
    fireEvent.change(screen.getByLabelText('Marketing date'), { target: { value: '2026-11-15' } })
    fireEvent.change(screen.getByLabelText('Zip code'), { target: { value: '77845' } })
    await screen.findByText('Location: College Station, TX')
    fireEvent.change(screen.getByLabelText('Contact phone'), { target: { value: '979-555-0100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }))
    expect(await screen.findByRole('heading', { name: 'My listings' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Submitted: 40 steers and 20 heifers')
    expect(body()).toMatchObject({
      groupId: 'MEMBER100',
      steerCount: '40',
      heiferCount: '20',
      breeds: ['Red Angus'],
      preconditioning: ['Weaned 45 Days'],
      marketingMethod: 'off_ranch',
      marketingDate: '2026-11-15',
      state: 'TX',
      zip: '77845',
      contactName: 'Member Ranch',
      contactPhone: '979-555-0100',
      groupIdOptout: false,
      callForPrice: false,
    })
  })

  it('marks the fields the server complains about and keeps what was typed', async () => {
    stubApi([(u, i) => (u === '/api/feeder-listings' && i?.method === 'POST' ? [400, { error: 'validation', fields: { breeds: 'Choose at least one breed.', marketingDate: 'Enter the marketing date.' } }] : null)])
    mount('/list/feeder')
    fireEvent.change(await screen.findByLabelText('Steers (head)'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }))
    expect(await screen.findByText('Choose at least one breed.')).toBeInTheDocument()
    expect(screen.getByText('Enter the marketing date.')).toBeInTheDocument()
    expect(screen.getByText(/some fields need another look/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Steers (head)')).toHaveValue('12')
  })

  it('tells the person when the 20 a day limit is hit', async () => {
    stubApi([(u, i) => (u === '/api/feeder-listings' && i?.method === 'POST' ? [429, { error: 'too_many_requests' }] : null)])
    mount('/list/feeder')
    fireEvent.click(await screen.findByRole('button', { name: 'Submit for review' }))
    expect(await screen.findByText(/20 groups today/)).toBeInTheDocument()
  })

  it('edit fills the form from the listing and saves with PUT', async () => {
    const mine = { ...feederMember, mine: true, zip: '77845', groupIdOptout: true }
    stubApi([
      (u, i) => (u === '/api/feeder-listings/9' && !i?.method ? [200, { listing: mine }] : null),
      (u, i) => (u === '/api/feeder-listings/9' && i?.method === 'PUT' ? [200, { listing: mine }] : null),
      (u) => (u.includes('/mine') ? [200, { listings: [] }] : null),
    ])
    mount('/list/feeder/9/edit')
    await waitFor(() => expect(screen.getByLabelText('Steers (head)')).toHaveValue('40'))
    expect(screen.getByLabelText('Don\'t show any ID')).toBeChecked()
    expect(screen.getByLabelText('Visual tag - first number')).toHaveValue('V100')
    expect(screen.queryByRole('navigation', { name: 'Kind of cattle' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByRole('heading', { name: 'My listings' })
    expect(post()?.init?.method).toBe('PUT')
  })
})

describe('breeding listing form', () => {
  it('has its own sections, and EPD rows with Unknown', async () => {
    stubApi([])
    mount('/list/breeding')
    for (const name of ['Basic Information', 'EPDs', 'Sale Information', 'Price', 'Contact']) {
      expect(await screen.findByRole('heading', { name })).toBeInTheDocument()
    }
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '2.1' } })
    fireEvent.click(screen.getByLabelText('Unknown'))
    expect(screen.getByLabelText('Value')).toBeDisabled()
    expect(screen.getByLabelText('Value')).toHaveValue('')
  })

  it('sends the EPD rows and class choices', async () => {
    stubApi([
      (u, i) => (u === '/api/breeding-listings' && i?.method === 'POST' ? [201, { listing: breeding }] : null),
      (u) => (u.includes('/mine') ? [200, { listings: [] }] : null),
    ])
    mount('/list/breeding')
    fireEvent.change(await screen.findByLabelText('Number of head'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Sex / class'), { target: { value: 'bull' } })
    const box = screen.getByLabelText('Breed(s)')
    fireEvent.change(box, { target: { value: 'Red Angus' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    fireEvent.change(screen.getByLabelText('Trait'), { target: { value: 'BW' } })
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '1.5' } })
    fireEvent.change(screen.getByLabelText('Sale type'), { target: { value: 'private_treaty' } })
    fireEvent.change(screen.getByLabelText('Sale date'), { target: { value: '2026-11-15' } })
    fireEvent.change(screen.getByLabelText('Zip code'), { target: { value: '77845' } })
    await screen.findByText('Location: College Station, TX')
    fireEvent.click(screen.getByLabelText('Call for price'))
    fireEvent.change(screen.getByLabelText('Contact phone'), { target: { value: '979-555-0100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }))
    expect(await screen.findByRole('heading', { name: 'My listings' })).toBeInTheDocument()
    expect(body()).toMatchObject({ headCount: '3', sexClass: 'bull', breeds: ['Red Angus'], epds: [{ trait: 'BW', value: '1.5', unknown: false }], saleType: 'private_treaty', callForPrice: true })
  })
})

describe('search and detail', () => {
  it('visitors see listings without contact details', async () => {
    stubApi([(u) => (u.startsWith('/api/feeder-listings?') || u === '/api/feeder-listings' ? [200, { total: 1, page: 1, pageSize: 20, listings: [feeder] }] : null)], null)
    mount('/search/feeder', null)
    expect(await screen.findByRole('link', { name: feeder.headline })).toHaveAttribute('href', '/feeder/9')
    expect(screen.getByText('$1.85 per cwt')).toBeInTheDocument()
    expect(screen.queryByText(/979-555/)).toBeNull()
  })

  it('sends the keyword to the server', async () => {
    stubApi([(u) => (u.startsWith('/api/breeding-listings') ? [200, { total: 0, page: 1, pageSize: 20, listings: [] }] : null)], null)
    mount('/search/breeding', null)
    fireEvent.change(await screen.findByLabelText('Search'), { target: { value: 'big sire' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(calls.some((c) => c.url.includes('/api/breeding-listings') && c.url.includes('q=big+sire'))).toBe(true))
  })

  it('feeder detail: signed-out users are asked to sign in for contact and tags', async () => {
    stubApi([(u) => (u === '/api/feeder-listings/9' ? [200, { listing: feeder }] : null)], null)
    mount('/feeder/9', null)
    expect(await screen.findByRole('heading', { name: feeder.headline })).toBeInTheDocument()
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByText('979-555-0100')).toBeNull()
    expect(screen.getByText('Bovi-Shield Gold 5')).toBeInTheDocument()
  })

  it('feeder detail: signed-in users see contact and tags', async () => {
    stubApi([(u) => (u === '/api/feeder-listings/9' ? [200, { listing: feederMember }] : null)])
    mount('/feeder/9')
    expect(await screen.findByText('979-555-0100')).toBeInTheDocument()
    expect(screen.getByText('Visual V100 to V160')).toBeInTheDocument()
  })

  it('breeding detail shows EPDs with Unknown', async () => {
    stubApi([(u) => (u === '/api/breeding-listings/4' ? [200, { listing: breeding }] : null)], null)
    mount('/breeding/4', null)
    expect(await screen.findByRole('heading', { name: '3 Red Angus Bulls' })).toBeInTheDocument()
    expect(screen.getByText('1.5')).toBeInTheDocument()
    expect(screen.getByText('Unknown')).toBeInTheDocument()
    expect(screen.getByText('Call for price', { selector: 'p' })).toBeInTheDocument()
  })

  it('an owner can withdraw their listing from the detail page', async () => {
    const mine = { ...feederMember, mine: true, zip: '77845' }
    stubApi([
      (u, i) => (u === '/api/feeder-listings/9/close' && i?.method === 'POST' ? [200, { ok: true }] : null),
      (u) => (u === '/api/feeder-listings/9' ? [200, { listing: mine }] : null),
    ])
    mount('/feeder/9')
    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw' }))
    await waitFor(() => expect(JSON.parse(String(post()?.init?.body))).toEqual({ status: 'withdrawn' }))
  })
})

describe('staff menu and review', () => {
  it('staff get Staff Tools with the waiting count, Review and Sale barns; members do not', async () => {
    stubApi([], staff)
    mount('/', staff)
    const btn = await screen.findByRole('button', { name: 'Staff Tools (4)' })
    fireEvent.click(btn)
    expect(screen.getByRole('menuitem', { name: /Review listings/ })).toHaveAttribute('href', '/staff/review')
    expect(screen.getByRole('menuitem', { name: 'Sale barns' })).toHaveAttribute('href', '/barns')
  })

  it('members get My listings, Account and Sign out under their name, and no Staff Tools', async () => {
    stubApi([])
    mount('/')
    fireEvent.click(await screen.findByRole('button', { name: 'Member Ranch' }))
    expect(screen.getByRole('menuitem', { name: 'My listings' })).toHaveAttribute('href', '/my-listings')
    expect(screen.getByRole('menuitem', { name: 'Account' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /staff tools/i })).toBeNull()
  })

  it('review: approve a waiting feeder listing, reject needs a reason, and breeding has its own tab', async () => {
    const waiting = { ...feederMember, status: 'pending' }
    stubApi(
      [
        (u) => (u.startsWith('/api/feeder-listings/queue') ? [200, { listings: [waiting] }] : null),
        (u) => (u.startsWith('/api/breeding-listings/queue') ? [200, { listings: [{ ...breeding, status: 'pending', contactPhone: '1', contactEmail: 'b@x.com', sellerName: 'B' }] }] : null),
        (u, i) => (u.includes('/review') && i?.method === 'POST' ? [200, { ok: true }] : null),
      ],
      staff,
    )
    mount('/staff/review', staff)
    expect(await screen.findByRole('link', { name: feeder.headline })).toHaveAttribute('href', '/feeder/9')
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('Tell the seller why.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(post()?.url).toBe('/api/feeder-listings/9/review'))
    expect(JSON.parse(String(post()?.init?.body))).toEqual({ decision: 'approve', note: '' })
    fireEvent.click(screen.getByRole('button', { name: 'Breeding Cattle' }))
    expect(await screen.findByRole('link', { name: '3 Red Angus Bulls' })).toHaveAttribute('href', '/breeding/4')
  })

  it('members are told the review page is staff only', async () => {
    stubApi([])
    mount('/staff/review')
    expect(await screen.findByRole('heading', { name: 'Staff only' })).toBeInTheDocument()
  })
})

describe('my listings', () => {
  it('shows feeder and breeding groups with edit links and reviewer notes', async () => {
    stubApi([
      (u) => (u.startsWith('/api/feeder-listings/mine') ? [200, { listings: [{ ...feederMember, mine: true, status: 'rejected', reviewNote: 'Add a weight.' }] }] : null),
      (u) => (u.startsWith('/api/breeding-listings/mine') ? [200, { listings: [{ ...breeding, mine: true }] }] : null),
    ])
    mount('/my-listings')
    expect(await screen.findByText('Note from the reviewer: Add a weight.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Feeder cattle' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Breeding cattle' })).toBeInTheDocument()
    const edits = screen.getAllByRole('link', { name: 'Edit' })
    expect(edits.map((a) => a.getAttribute('href'))).toEqual(['/list/feeder/9/edit', '/list/breeding/4/edit'])
  })
})
