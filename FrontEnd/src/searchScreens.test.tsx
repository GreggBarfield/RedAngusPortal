import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App'

const member = { id: '1', email: 'm@x.com', displayName: 'Member Ranch', membershipNumber: '1', membershipStatus: 'verified', role: 'member' }

const base = {
  breeds: ['Red Angus'],
  description: null,
  city: 'College Station',
  state: 'TX',
  priceBasis: 'per_cwt',
  askingPrice: 1.85,
  callForPrice: false,
  status: 'approved',
  approvedAt: null,
  createdAt: '2026-10-01',
}
const feederA = {
  ...base,
  id: '9',
  groupId: 'BARFIELD100',
  headline: '40 steers and 20 heifers - Red Angus, 583 lbs',
  steerCount: 40,
  heiferCount: 20,
  headCount: 60,
  avgWeightSteers: 600,
  avgWeightHeifers: 550,
  avgWeight: 583,
  ageMonths: 7,
  daysWeaned: null,
  preconditioning: ['Weaned 45 Days'],
  special: [],
  vaccinations: [{ date: '2026-08-01', product: 'Bovi-Shield Gold 5' }],
  marketingMethod: 'off_ranch',
  auctionName: null,
  marketingDate: '2026-11-15',
  contactName: 'Sam',
  contactPhone: '979-555-0100',
  contactEmail: 'sam@x.com',
}
const feederB = { ...feederA, id: '10', headline: '25 steers - Angus, 700 lbs', steerCount: 25, heiferCount: 0, headCount: 25, groupId: 'JONES100', contactPhone: '979-555-0199', vaccinations: [] }
const bull = {
  ...base,
  id: '4',
  headline: '3 Red Angus Bulls',
  headCount: 3,
  sexClass: 'bull',
  ageMonths: null,
  regNumber: 'RA123',
  breedClass: 'purebred',
  sire: 'Big Sire',
  dam: null,
  saleTitle: null,
  saleType: 'private_treaty',
  auctionName: null,
  saleDate: '2026-11-15',
  askingPrice: null,
  callForPrice: true,
  epds: [{ trait: 'BW', value: 1.5, unknown: false }],
}

type Handler = (url: string, init?: RequestInit) => [number, unknown] | null
let calls: { url: string; init?: RequestInit }[] = []

function stubApi(handlers: Handler[], who: typeof member | null = null) {
  calls = []
  const std: Handler = (url) => {
    if (url.startsWith('/api/auth/me')) return who ? [200, { user: who }] : [401, { error: 'unauthorized' }]
    if (url.startsWith('/api/ref/breeds')) return [200, { breeds: ['Red Angus', 'Angus', 'Hereford'] }]
    if (url.startsWith('/api/ref/programs')) return [200, { programs: [{ name: 'Weaned 45 Days', type: 'PC', image: null }] }]
    if (url.startsWith('/api/ref/epd-traits')) return [200, { traits: [{ code: 'BW', name: 'Birth Weight', unit: 'lb', description: null }, { code: 'WW', name: 'Weaning Weight', unit: 'lb', description: null }] }]
    if (url.includes('pending-count')) return [200, { pending: 0 }]
    return null
  }
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init })
      for (const h of [...handlers, std]) {
        const r = h(url, init)
        if (r) return Promise.resolve(new Response(JSON.stringify(r[1]), { status: r[0] }))
      }
      return Promise.resolve(new Response(JSON.stringify({ error: 'not_found' }), { status: 404 }))
    }),
  )
}

const feederList = (listings: unknown[], total = listings.length): Handler => (u) => (u.startsWith('/api/feeder-listings') ? [200, { total, page: 1, pageSize: 20, listings }] : null)
const breedingList = (listings: unknown[]): Handler => (u) => (u.startsWith('/api/breeding-listings') ? [200, { total: listings.length, page: 1, pageSize: 20, listings }] : null)
const lastSearch = (kind: 'feeder' | 'breeding' = 'feeder') => [...calls].reverse().find((c) => c.url.startsWith(`/api/${kind}-listings`))?.url ?? ''
const lastParams = (kind: 'feeder' | 'breeding' = 'feeder') => new URLSearchParams(lastSearch(kind).split('?')[1] ?? '')

function mount(path: string, who: typeof member | null = null) {
  if (who) localStorage.setItem('raaaa_token', 'tok')
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}
const chip = (name: string | RegExp) => screen.findByRole('button', { name })

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('filter chips', () => {
  it('feeder search has the BlockTrust filter chips', async () => {
    stubApi([feederList([])])
    mount('/search/feeder')
    const row = await screen.findByRole('list', { name: 'Filters' })
    for (const t of ['Breed', 'Programs', 'Marketing Method', 'Marketing Date', 'Weight', 'Age', 'Tagged', 'State', 'Within X miles']) {
      expect(within(row).getByRole('button', { name: t })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Saved Filters' })).toBeInTheDocument()
  })

  it('breeding search has class, EPD and sale date chips', async () => {
    stubApi([breedingList([])])
    mount('/search/breeding')
    const row = await screen.findByRole('list', { name: 'Filters' })
    for (const t of ['Breed', 'Sex / Class', 'EPDs', 'Sale Date', 'State', 'Within X miles']) {
      expect(within(row).getByRole('button', { name: t })).toBeInTheDocument()
    }
    expect(within(row).queryByRole('button', { name: 'Tagged' })).toBeNull()
  })

  it('breed filter: choose a breed, apply, see it in the chip, then remove it', async () => {
    stubApi([feederList([feederA])])
    mount('/search/feeder')
    fireEvent.click(await chip('Breed'))
    const box = await screen.findByRole('group', { name: 'Breed filter' })
    fireEvent.change(within(box).getByLabelText('Breed'), { target: { value: 'Angus' } })
    fireEvent.click(within(box).getByRole('button', { name: 'Add' }))
    fireEvent.click(within(box).getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(lastParams().getAll('breed')).toEqual(['Angus']))
    expect(await chip('Breed: Angus')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Breed filter' }))
    await waitFor(() => expect(lastParams().has('breed')).toBe(false))
  })

  it('tagged toggles straight away', async () => {
    stubApi([feederList([])])
    mount('/search/feeder')
    fireEvent.click(await chip('Tagged'))
    await waitFor(() => expect(lastParams().get('tagged')).toBe('1'))
    expect(screen.getByRole('button', { name: 'Tagged' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Tagged' }))
    await waitFor(() => expect(lastParams().has('tagged')).toBe(false))
  })

  it('method, weight and state filters send their settings', async () => {
    stubApi([feederList([])])
    mount('/search/feeder')
    fireEvent.click(await chip('Marketing Method'))
    fireEvent.change(await screen.findByLabelText('Marketing method'), { target: { value: 'auction' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(lastParams().get('method')).toBe('auction'))

    fireEvent.click(await chip('Weight'))
    fireEvent.change(await screen.findByLabelText('Minimum weight (lbs)'), { target: { value: '500' } })
    fireEvent.change(screen.getByLabelText('Maximum weight (lbs)'), { target: { value: '650' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(lastParams().get('minWeight')).toBe('500'))
    expect(lastParams().get('maxWeight')).toBe('650')
    expect(lastParams().get('method')).toBe('auction')

    fireEvent.click(await chip('State'))
    fireEvent.change(await screen.findByLabelText('State'), { target: { value: 'TX' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(lastParams().get('state')).toBe('TX'))
  })

  it('weight must be numbers in order', async () => {
    stubApi([feederList([])])
    mount('/search/feeder')
    fireEvent.click(await chip('Weight'))
    fireEvent.change(await screen.findByLabelText('Minimum weight (lbs)'), { target: { value: '700' } })
    fireEvent.change(screen.getByLabelText('Maximum weight (lbs)'), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('cannot be bigger')
    expect(lastParams().has('minWeight')).toBe(false)
  })

  it('Within X miles needs a zip and miles, then sends both and enables Closest', async () => {
    stubApi([feederList([feederA])])
    mount('/search/feeder')
    expect(await screen.findByRole('option', { name: 'Closest' })).toBeDisabled()
    fireEvent.click(await chip('Within X miles'))
    fireEvent.change(await screen.findByLabelText('Zip code'), { target: { value: '778' } })
    fireEvent.change(screen.getByLabelText('Within (miles)'), { target: { value: '150' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(await screen.findByText('Enter a 5-digit zip code.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Zip code'), { target: { value: '77845' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(lastParams().get('zip')).toBe('77845'))
    expect(lastParams().get('miles')).toBe('150')
    expect(await chip('Within X miles: 150 mi of 77845')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Closest' })).not.toBeDisabled()
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'distance:asc' } })
    await waitFor(() => expect(lastParams().get('sort')).toBe('distance'))
    expect(lastParams().get('dir')).toBe('asc')
  })

  it('shows the server message when the zip is not found', async () => {
    stubApi([(u) => (u.includes('zip=00000') ? [400, { error: 'validation', fields: { zip: 'We could not find that zip code.' } }] : null), feederList([])])
    mount('/search/feeder?zip=00000&miles=50')
    expect(await screen.findByText('We could not find that zip code.')).toBeInTheDocument()
  })

  it('EPD filter sends trait:min:max rows', async () => {
    stubApi([breedingList([bull])])
    mount('/search/breeding')
    fireEvent.click(await chip('EPDs'))
    const box = await screen.findByRole('group', { name: 'EPDs filter' })
    await within(box).findByRole('option', { name: 'Birth Weight (BW)' })
    fireEvent.change(within(box).getByLabelText('EPD trait'), { target: { value: 'BW' } })
    fireEvent.change(within(box).getByLabelText('At most'), { target: { value: '2' } })
    fireEvent.click(within(box).getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(lastParams('breeding').getAll('epd')).toEqual(['BW::2']))
    expect(await chip('EPDs: 1 trait')).toBeInTheDocument()
  })

  it('class filter sends the chosen classes', async () => {
    stubApi([breedingList([bull])])
    mount('/search/breeding')
    fireEvent.click(await chip('Sex / Class'))
    fireEvent.click(await screen.findByLabelText('Bull'))
    fireEvent.click(screen.getByLabelText('Cow'))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(lastParams('breeding').getAll('class')).toEqual(['bull', 'cow']))
  })

  it('starts from the address, and Clear all filters empties it', async () => {
    stubApi([feederList([feederA])])
    mount('/search/feeder?method=auction&tagged=1&q=angus')
    expect(await chip('Marketing Method: Auction')).toBeInTheDocument()
    await waitFor(() => expect(lastParams().get('q')).toBe('angus'))
    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }))
    await waitFor(() => expect(lastSearch()).toBe('/api/feeder-listings'))
    expect(screen.getByLabelText('Search')).toHaveValue('')
  })
})

describe('sorting and paging', () => {
  it('sort choice goes to the server', async () => {
    stubApi([feederList([feederA])])
    mount('/search/feeder')
    fireEvent.change(await screen.findByLabelText('Sort by'), { target: { value: 'marketingDate:asc' } })
    await waitFor(() => expect(lastParams().get('sort')).toBe('marketingDate'))
    expect(lastParams().get('dir')).toBe('asc')
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'newest:desc' } })
    await waitFor(() => expect(lastParams().has('sort')).toBe(false))
  })

  it('next page asks for page 2 and keeps the filters', async () => {
    stubApi([(u) => (u.startsWith('/api/feeder-listings') ? [200, { total: 45, page: 1, pageSize: 20, listings: [feederA] }] : null)])
    mount('/search/feeder?method=auction')
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    await waitFor(() => expect(lastParams().get('page')).toBe('2'))
    expect(lastParams().get('method')).toBe('auction')
    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument()
  })

  it('a keyword search keeps the filters and drops the page', async () => {
    stubApi([feederList([feederA])])
    mount('/search/feeder?method=auction&page=2')
    fireEvent.change(await screen.findByLabelText('Search'), { target: { value: 'herd' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(lastParams().get('q')).toBe('herd'))
    expect(lastParams().get('method')).toBe('auction')
    expect(lastParams().has('page')).toBe(false)
  })
})

describe('selected listing panel', () => {
  it('shows the first listing, then the one you pick', async () => {
    stubApi([feederList([feederA, feederB])], member)
    mount('/search/feeder', member)
    const panel = await screen.findByRole('complementary', { name: 'Selected listing' })
    expect(within(panel).getByRole('heading', { name: feederA.headline })).toBeInTheDocument()
    expect(within(panel).getByText('979-555-0100')).toBeInTheDocument()
    expect(within(panel).getByText('Bovi-Shield Gold 5')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Preview' })[0])
    expect(await within(panel).findByRole('heading', { name: feederB.headline })).toBeInTheDocument()
    expect(within(panel).getByText('979-555-0199')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Open the full listing' })).toHaveAttribute('href', '/feeder/10')
  })

  it('visitors are asked to sign in for contact details', async () => {
    stubApi([feederList([{ ...feederA, contactPhone: undefined, contactName: undefined, contactEmail: undefined }])])
    mount('/search/feeder')
    const panel = await screen.findByRole('complementary', { name: 'Selected listing' })
    expect(within(panel).getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByText(/979-555/)).toBeNull()
  })

  it('breeding panel lists EPDs', async () => {
    stubApi([breedingList([bull])])
    mount('/search/breeding')
    const panel = await screen.findByRole('complementary', { name: 'Selected listing' })
    expect(within(panel).getByText('BW')).toBeInTheDocument()
    expect(within(panel).getByText('1.5')).toBeInTheDocument()
  })
})

describe('saved filters', () => {
  it('signed-out visitors are told to sign in', async () => {
    stubApi([feederList([])])
    mount('/search/feeder')
    fireEvent.click(await chip('Saved Filters'))
    const box = await screen.findByRole('group', { name: 'Saved filters' })
    expect(within(box).getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('saves the current search under a name', async () => {
    const saved: unknown[] = []
    stubApi(
      [
        feederList([]),
        (u, init) => {
          if (u.startsWith('/api/saved-filters') && init?.method === 'POST') {
            saved.push(JSON.parse(String(init.body)))
            return [201, { filter: { id: '5', kind: 'feeder', name: 'Big steers', params: {} } }]
          }
          if (u.startsWith('/api/saved-filters')) return [200, { filters: [] }]
          return null
        },
      ],
      member,
    )
    mount('/search/feeder?method=auction&breed=Angus&breed=Hereford&q=herd', member)
    fireEvent.click(await chip('Saved Filters'))
    const box = await screen.findByRole('group', { name: 'Saved filters' })
    expect(await within(box).findByText('Nothing saved yet.')).toBeInTheDocument()
    fireEvent.change(within(box).getByLabelText('Save this search as'), { target: { value: 'Big steers' } })
    fireEvent.click(within(box).getByRole('button', { name: 'Save' }))
    expect(await within(box).findByText('Saved as "Big steers".')).toBeInTheDocument()
    expect(saved[0]).toEqual({ kind: 'feeder', name: 'Big steers', params: { q: 'herd', method: 'auction', breed: ['Angus', 'Hereford'] } })
  })

  it('applies a saved search and can delete one', async () => {
    let list = [
      { id: '5', kind: 'feeder', name: 'Texas weaned', params: { state: 'TX', program: ['Weaned 45 Days'], zip: '77845', miles: '100' } },
      { id: '6', kind: 'feeder', name: 'Old one', params: { method: 'auction' } },
    ]
    stubApi(
      [
        feederList([]),
        (u, init) => {
          if (u === '/api/saved-filters/6' && init?.method === 'DELETE') {
            list = list.filter((f) => f.id !== '6')
            return [200, { ok: true }]
          }
          if (u.startsWith('/api/saved-filters')) return [200, { filters: list }]
          return null
        },
      ],
      member,
    )
    mount('/search/feeder', member)
    fireEvent.click(await chip('Saved Filters'))
    const box = await screen.findByRole('group', { name: 'Saved filters' })
    fireEvent.click(await within(box).findByRole('button', { name: 'Delete Old one' }))
    await waitFor(() => expect(within(box).queryByText('Old one')).toBeNull())
    fireEvent.click(within(box).getByRole('button', { name: 'Texas weaned' }))
    await waitFor(() => expect(lastParams().get('state')).toBe('TX'))
    expect(lastParams().getAll('program')).toEqual(['Weaned 45 Days'])
    expect(lastParams().get('zip')).toBe('77845')
    expect(await chip('State: Texas')).toBeInTheDocument()
  })

  it('cannot save an empty search', async () => {
    stubApi([feederList([]), (u) => (u.startsWith('/api/saved-filters') ? [200, { filters: [] }] : null)], member)
    mount('/search/feeder', member)
    fireEvent.click(await chip('Saved Filters'))
    const box = await screen.findByRole('group', { name: 'Saved filters' })
    expect(within(box).getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})

describe('program drop-downs on the feeder form', () => {
  it('sit beside the breed box, open on click, show tags and close when you click away', async () => {
    stubApi([(u) => (u.startsWith('/api/ref/group-id') ? [200, { groupId: 'MEMBER100' }] : u.startsWith('/api/ref/countries') ? [200, { countries: ['United States'] }] : null)], member)
    mount('/list/feeder', member)
    const pc = await screen.findByRole('button', { name: 'Preconditioning programs' })
    expect(pc).toHaveTextContent('Select...')
    expect(screen.getByRole('button', { name: 'Special programs' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Preconditioning programs choices' })).toBeNull()
    fireEvent.click(pc)
    fireEvent.click(await screen.findByLabelText('Weaned 45 Days'))
    expect(pc).toHaveTextContent('1 selected')
    const tags = screen.getByRole('list', { name: 'Chosen: Preconditioning programs' })
    expect(within(tags).getByText('Weaned 45 Days')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('group', { name: 'Preconditioning programs choices' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Weaned 45 Days' }))
    expect(pc).toHaveTextContent('Select...')
  })
})
