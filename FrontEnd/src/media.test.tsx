import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App'

const staff = { id: '2', email: 's@x.com', displayName: 'Staff Person', membershipNumber: '1', membershipStatus: 'verified', role: 'staff' }
const member = { ...staff, id: '1', email: 'm@x.com', displayName: 'Member Ranch', role: 'member' }

const BASE = 'https://photos.example.com/listings/raa/feeder/9'
const photo = (n: number, cover = false) => ({ id: `p${n}`, thumbUrl: `${BASE}/${n}_thumb.jpg`, mediumUrl: `${BASE}/${n}_medium.jpg`, fullUrl: `${BASE}/${n}.jpg`, isCover: cover })
const doc = { id: 'd1', name: 'Health Records.pdf', ext: 'pdf', docType: 'health_records', size: 204800 }

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
  birthDate: null,
  ageMonths: null,
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
  approvedAt: null,
  createdAt: '2026-10-01',
  photos: [photo(1, true), photo(2)],
  attachmentCount: 1,
}
const forMember = { ...feeder, attachments: [doc], contactName: 'Sam', contactPhone: '979-555-0100', contactEmail: 'sam@x.com', sellerName: 'Sam Ranch', mine: false }
const mine = { ...forMember, mine: true, zip: '77845' }
const breeding = {
  id: '4',
  headline: '3 Red Angus Bulls',
  headCount: 3,
  sexClass: 'bull',
  breeds: ['Red Angus'],
  saleType: 'private_treaty',
  saleDate: '2026-11-15',
  city: 'Bryan',
  state: 'TX',
  askingPrice: null,
  callForPrice: true,
  epds: [],
  status: 'approved',
  photos: [{ id: 'b1', thumbUrl: 'https://photos.example.com/b1_thumb.jpg', mediumUrl: 'https://photos.example.com/b1_medium.jpg', fullUrl: 'https://photos.example.com/b1.jpg', isCover: true }],
  attachmentCount: 0,
}

type Handler = (url: string, init?: RequestInit) => [number, unknown] | null
let calls: { url: string; init?: RequestInit }[] = []

function stubApi(handlers: Handler[], who: typeof member | null = member) {
  calls = []
  const base: Handler = (url) => {
    if (url.startsWith('/api/auth/me')) return who ? [200, { user: who }] : [401, { error: 'unauthorized' }]
    if (url.startsWith('/api/ref/breeds')) return [200, { breeds: ['Red Angus', 'Angus'] }]
    if (url.startsWith('/api/ref/programs')) return [200, { programs: [] }]
    if (url.startsWith('/api/ref/countries')) return [200, { countries: ['United States'] }]
    if (url.startsWith('/api/ref/epd-traits')) return [200, { traits: [] }]
    if (url.startsWith('/api/ref/group-id')) return [200, { groupId: 'MEMBER100' }]
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

function mount(path: string, who: typeof member | null = member) {
  if (who) localStorage.setItem('raaaa_token', 'tok')
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

const file = (name: string, type: string, size = 100) => new File([new Uint8Array(size)], name, { type })
const pick = (label: string, files: File[]) => fireEvent.change(screen.getByLabelText(label), { target: { files } })
const photosInput = () => screen.getByLabelText(/^Photos \(/)
const docsInput = () => screen.getByLabelText(/^Documents \(/)
const sent = (re: RegExp, method = 'POST') => calls.filter((c) => re.test(c.url) && c.init?.method === method)
const created = (id = '9') => (u: string, i?: RequestInit) => (u === '/api/feeder-listings' && i?.method === 'POST' ? ([201, { listing: { ...feeder, id }, ok: true }] as [number, unknown]) : null)
const uploads = (u: string, i?: RequestInit) => (i?.method === 'POST' && /\/(photos|attachments)(\?|$)/.test(u) ? ([201, { ok: true }] as [number, unknown]) : null)
const noLists = (u: string) => (u.includes('/mine') ? ([200, { listings: [] }] as [number, unknown]) : null)

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('photos and documents on the feeder form', () => {
  it('has the section with its limits', async () => {
    stubApi([])
    mount('/list/feeder')
    expect(await screen.findByRole('heading', { name: 'Photos and Documents' })).toBeInTheDocument()
    expect(photosInput()).toHaveAttribute('accept', 'image/jpeg,image/png')
    expect(screen.getByLabelText('Photos (0 of 10)')).toBeInTheDocument()
    expect(screen.getByLabelText('Documents (0 of 5)')).toBeInTheDocument()
    expect(screen.queryByText(/sends it back to our staff/)).toBeNull()
  })

  it('picked photos wait on the form and can be taken out again; nothing is sent yet', async () => {
    stubApi([])
    mount('/list/feeder')
    await screen.findByRole('heading', { name: 'Photos and Documents' })
    pick('Photos (0 of 10)', [file('bull.jpg', 'image/jpeg'), file('cows.png', 'image/png')])
    const list = screen.getByRole('list', { name: 'Photos on this listing' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(list).toHaveTextContent('bull.jpg - will be added when you save')
    expect(screen.getByLabelText('Photos (2 of 10)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove bull.jpg' }))
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(calls.some((c) => /photos|attachments/.test(c.url))).toBe(false)
  })

  it('turns away files that are not photos, are too big, or are too many', async () => {
    stubApi([])
    mount('/list/feeder')
    await screen.findByRole('heading', { name: 'Photos and Documents' })
    pick('Photos (0 of 10)', [file('notes.txt', 'text/plain'), file('huge.jpg', 'image/jpeg', 10 * 1024 * 1024 + 1), file('ok.jpg', 'image/jpeg')])
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('notes.txt is not a JPG or PNG photo.')
    expect(alert).toHaveTextContent('huge.jpg is bigger than 10 MB.')
    expect(screen.getByLabelText('Photos (1 of 10)')).toBeInTheDocument()

    pick('Photos (1 of 10)', Array.from({ length: 12 }, (_, i) => file(`p${i}.jpg`, 'image/jpeg')))
    expect(screen.getByRole('alert')).toHaveTextContent('Only the first 9 were added.')
    expect(screen.getByLabelText('Photos (10 of 10)')).toBeDisabled()
  })

  it('turns away documents of the wrong kind and more than five', async () => {
    stubApi([])
    mount('/list/feeder')
    await screen.findByRole('heading', { name: 'Photos and Documents' })
    pick('Documents (0 of 5)', [file('setup.exe', 'application/x-msdownload'), file('a.pdf', 'application/pdf'), file('b.docx', ''), file('c.xlsx', ''), file('d.pdf', 'application/pdf'), file('e.pdf', 'application/pdf'), file('f.pdf', 'application/pdf')])
    expect(screen.getByRole('alert')).toHaveTextContent('setup.exe is not a PDF, Word, Excel, JPG or PNG file.')
    expect(screen.getByRole('alert')).toHaveTextContent('up to 5 files')
    expect(screen.getByLabelText('Documents (5 of 5)')).toBeDisabled()
  })

  it('saves the listing first, then sends each photo and document with the sign-in', async () => {
    stubApi([created(), uploads, noLists])
    mount('/list/feeder')
    await screen.findByRole('heading', { name: 'Photos and Documents' })
    const bull = file('bull.jpg', 'image/jpeg', 300)
    pick('Photos (0 of 10)', [bull])
    pick('Documents (0 of 5)', [file('EPD Sheet.pdf', 'application/pdf', 50)])
    fireEvent.change(screen.getByLabelText('Kind of document for EPD Sheet.pdf'), { target: { value: 'epd_report' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }))
    expect(await screen.findByRole('heading', { name: 'My listings' })).toBeInTheDocument()

    const order = calls.filter((c) => c.init?.method === 'POST').map((c) => c.url)
    expect(order).toEqual(['/api/feeder-listings', '/api/feeder-listings/9/photos', '/api/feeder-listings/9/attachments?name=EPD%20Sheet.pdf&docType=epd_report'])
    const up = sent(/\/9\/photos$/)[0]
    expect((up.init!.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect((up.init!.headers as Record<string, string>)['Content-Type']).toBe('application/octet-stream')
    expect(up.init!.body).toBe(bull)
  })

  it('a listing without files saves exactly as before', async () => {
    stubApi([created(), noLists])
    mount('/list/feeder')
    fireEvent.click(await screen.findByRole('button', { name: 'Submit for review' }))
    expect(await screen.findByRole('heading', { name: 'My listings' })).toBeInTheDocument()
    expect(calls.filter((c) => c.init?.method === 'POST')).toHaveLength(1)
  })

  it('if a file does not go through, the saved listing is kept and its edit page opens with a note', async () => {
    stubApi([
      created(),
      (u, i) => (/\/9\/photos$/.test(u) && i?.method === 'POST' ? [409, { error: 'validation', fields: { file: 'You can add up to 10 photos.' } }] : null),
      (u, i) => (u === '/api/feeder-listings/9' && !i?.method ? [200, { listing: { ...mine, photos: [], attachments: [] } }] : null),
      uploads,
    ])
    mount('/list/feeder')
    await screen.findByRole('heading', { name: 'Photos and Documents' })
    pick('Photos (0 of 10)', [file('bull.jpg', 'image/jpeg')])
    pick('Documents (0 of 5)', [file('papers.pdf', 'application/pdf')])
    fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }))

    expect(await screen.findByRole('heading', { name: 'Edit your listing' })).toBeInTheDocument()
    const banner = await screen.findByText(/Your listing was saved, but some files did not go through/)
    expect(banner).toHaveTextContent('bull.jpg: You can add up to 10 photos.')
    // the document that did go through is not offered again, and the failed photo is not queued twice
    expect(banner).not.toHaveTextContent('papers.pdf')
    expect(sent(/\/9\/attachments/)).toHaveLength(1)
    expect(screen.getByLabelText('Photos (0 of 10)')).toBeInTheDocument()
    expect(calls.filter((c) => c.url === '/api/feeder-listings' && c.init?.method === 'POST')).toHaveLength(1)
  })
})

describe('editing a listing that already has files', () => {
  const open = async () => {
    stubApi([(u, i) => (u === '/api/feeder-listings/9' && !i?.method ? [200, { listing: mine }] : null), (u) => (/\/photos\/p\d(\/cover)?$/.test(u) || /\/attachments\/d1$/.test(u) ? [200, { ok: true }] : null)])
    mount('/list/feeder/9/edit')
    await screen.findByRole('list', { name: 'Photos on this listing' })
  }

  it('shows them, and warns that changes go back to staff', async () => {
    await open()
    expect(screen.getByLabelText('Photos (2 of 10)')).toBeInTheDocument()
    expect(screen.getByAltText('Photo 1')).toHaveAttribute('src', `${BASE}/1_thumb.jpg`)
    expect(screen.getByText('Cover')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Documents on this listing' })).toHaveTextContent('Health Records.pdf (Health records, 200 KB)')
    expect(screen.getByText(/sends it back to our staff/)).toBeInTheDocument()
  })

  it('removing a photo happens right away', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo 2' }))
    expect(await screen.findByText('Photo removed.')).toBeInTheDocument()
    expect(sent(/\/api\/feeder-listings\/9\/photos\/p2$/, 'DELETE')).toHaveLength(1)
    expect(screen.queryByAltText('Photo 2')).toBeNull()
    expect(screen.getByLabelText('Photos (1 of 10)')).toBeInTheDocument()
  })

  it('removing the cover makes the next photo the cover', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }))
    await screen.findByText('Photo removed.')
    expect(screen.getByText('Cover')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Make photo 1 the cover/ })).toBeNull()
  })

  it('choosing another cover happens right away and moves it to the front', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Make photo 2 the cover' }))
    expect(await screen.findByText('Cover photo changed.')).toBeInTheDocument()
    expect(sent(/\/photos\/p2\/cover$/)).toHaveLength(1)
    const items = within(screen.getByRole('list', { name: 'Photos on this listing' })).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Cover')
    expect(items[0].querySelector('img')).toHaveAttribute('src', `${BASE}/2_thumb.jpg`)
  })

  it('removing a document happens right away', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Health Records.pdf' }))
    expect(await screen.findByText('Document removed.')).toBeInTheDocument()
    expect(sent(/\/attachments\/d1$/, 'DELETE')).toHaveLength(1)
    expect(screen.queryByRole('list', { name: 'Documents on this listing' })).toBeNull()
  })

  it('says so when a removal fails', async () => {
    stubApi([
      (u, i) => (u === '/api/feeder-listings/9' && !i?.method ? [200, { listing: mine }] : null),
      (u, i) => (i?.method === 'DELETE' ? [409, { error: 'closed' }] : null),
    ])
    mount('/list/feeder/9/edit')
    await screen.findByRole('list', { name: 'Photos on this listing' })
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo 2' }))
    expect(await screen.findByText('This listing is closed and cannot be changed.')).toBeInTheDocument()
    expect(screen.getByAltText('Photo 2')).toBeInTheDocument()
  })
})

describe('photos and documents on the breeding form', () => {
  it('sends them to the breeding routes', async () => {
    stubApi([(u, i) => (u === '/api/breeding-listings' && i?.method === 'POST' ? [201, { listing: { ...breeding, id: '4' } }] : null), uploads, noLists])
    mount('/list/breeding')
    await screen.findByRole('heading', { name: 'Photos and Documents' })
    pick('Photos (0 of 10)', [file('bull.jpg', 'image/jpeg')])
    pick('Documents (0 of 5)', [file('Pedigree.pdf', 'application/pdf')])
    fireEvent.change(screen.getByLabelText('Kind of document for Pedigree.pdf'), { target: { value: 'pedigree' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }))
    expect(await screen.findByRole('heading', { name: 'My listings' })).toBeInTheDocument()
    expect(calls.filter((c) => c.init?.method === 'POST').map((c) => c.url)).toEqual([
      '/api/breeding-listings',
      '/api/breeding-listings/4/photos',
      '/api/breeding-listings/4/attachments?name=Pedigree.pdf&docType=pedigree',
    ])
  })
})

describe('what buyers see', () => {
  it('detail page: a photo gallery you can click through', async () => {
    stubApi([(u) => (u === '/api/feeder-listings/9' ? [200, { listing: forMember }] : null)])
    mount('/feeder/9')
    const main = await screen.findByAltText('Photo 1 of 2')
    expect(main).toHaveAttribute('src', `${BASE}/1_medium.jpg`)
    expect(main.closest('a')).toHaveAttribute('href', `${BASE}/1.jpg`)
    fireEvent.click(screen.getByRole('button', { name: 'Show photo 2' }))
    expect(screen.getByAltText('Photo 2 of 2')).toHaveAttribute('src', `${BASE}/2_medium.jpg`)
    expect(screen.getByRole('button', { name: 'Show photo 2' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('detail page: one photo shows no thumbnail row; no photos shows no gallery', async () => {
    stubApi([(u) => (u === '/api/feeder-listings/9' ? [200, { listing: { ...forMember, photos: [photo(1, true)] } }] : null)])
    mount('/feeder/9')
    await screen.findByAltText('Photo 1 of 1')
    expect(screen.queryByRole('group', { name: 'Photos' })).toBeNull()
  })

  it('detail page: a listing without photos or documents looks as before', async () => {
    const plain = { ...forMember, photos: [], attachments: [], attachmentCount: 0 }
    stubApi([(u) => (u === '/api/feeder-listings/9' ? [200, { listing: plain }] : null)])
    mount('/feeder/9')
    await screen.findByRole('heading', { name: feeder.headline })
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Documents' })).toBeNull()
  })

  it('detail page: a listing from the older API shape (no photo fields) still opens', async () => {
    const old: Record<string, unknown> = { ...forMember }
    delete old.photos
    delete old.attachments
    delete old.attachmentCount
    stubApi([(u) => (u === '/api/feeder-listings/9' ? [200, { listing: old }] : null)])
    mount('/feeder/9')
    expect(await screen.findByRole('heading', { name: feeder.headline })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Documents' })).toBeNull()
  })

  it('detail page: a signed-in buyer downloads a document with the sign-in', async () => {
    const link: { download: string; href: string }[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      link.push({ download: this.download, href: this.href })
    })
    URL.createObjectURL = vi.fn(() => 'blob:fake')
    URL.revokeObjectURL = vi.fn()
    stubApi([(u) => (u === '/api/feeder-listings/9' ? [200, { listing: forMember }] : null), (u) => (u === '/api/feeder-listings/9/attachments/d1/file' ? [200, { fake: 'pdf bytes' }] : null)])
    mount('/feeder/9')
    expect(await screen.findByRole('heading', { name: 'Documents' })).toBeInTheDocument()
    expect(screen.getByText('Health Records.pdf')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Download Health Records.pdf' }))
    await waitFor(() => expect(link).toHaveLength(1))
    expect(link[0]).toEqual({ download: 'Health Records.pdf', href: 'blob:fake' })
    const get = calls.find((c) => c.url === '/api/feeder-listings/9/attachments/d1/file')!
    expect((get.init!.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    vi.restoreAllMocks()
  })

  it('detail page: a download that fails says so', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:fake')
    stubApi([(u) => (u === '/api/feeder-listings/9' ? [200, { listing: forMember }] : null), (u) => (u.endsWith('/file') ? [404, { error: 'not_found' }] : null)])
    mount('/feeder/9')
    fireEvent.click(await screen.findByRole('button', { name: 'Download Health Records.pdf' }))
    expect(await screen.findByText('Could not download that file. Try again.')).toBeInTheDocument()
  })

  it('detail page: a visitor sees the photos but is asked to sign in for the documents', async () => {
    const visitor = { ...feeder }
    stubApi([(u) => (u === '/api/feeder-listings/9' ? [200, { listing: visitor }] : null)], null)
    mount('/feeder/9', null)
    await screen.findByAltText('Photo 1 of 2')
    const block = screen.getByRole('heading', { name: 'Documents' }).closest('div')!.parentElement!
    expect(block).toHaveTextContent('1 document is attached.')
    expect(within(block).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(screen.queryByText('Health Records.pdf')).toBeNull()
    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull()
  })

  it('search: a card shows the cover photo; the side panel shows the gallery and documents', async () => {
    stubApi([
      (u) => (u.startsWith('/api/feeder-listings?') || u === '/api/feeder-listings' ? [200, { total: 1, page: 1, pageSize: 20, listings: [forMember] }] : null),
      (u) => (u.startsWith('/api/saved-filters') ? [200, { filters: [] }] : null),
    ])
    mount('/search/feeder')
    const card = (await screen.findByRole('link', { name: feeder.headline })).closest('article')!
    expect(card.querySelector('img')).toHaveAttribute('src', `${BASE}/1_thumb.jpg`)
    const panel = screen.getByRole('complementary', { name: 'Selected listing' })
    expect(within(panel).getByAltText('Photo 1 of 2')).toHaveAttribute('src', `${BASE}/1_medium.jpg`)
    expect(within(panel).getByRole('button', { name: 'Download Health Records.pdf' })).toBeInTheDocument()
  })

  it('search: cards without photos have no picture', async () => {
    stubApi([(u) => (u.startsWith('/api/breeding-listings') ? [200, { total: 1, page: 1, pageSize: 20, listings: [{ ...breeding, photos: [] }] }] : null)])
    mount('/search/breeding')
    const card = (await screen.findByRole('link', { name: breeding.headline })).closest('article')!
    expect(card.querySelector('img')).toBeNull()
  })

  it('My listings: each listing shows its cover photo', async () => {
    stubApi([(u) => (u.startsWith('/api/feeder-listings/mine') ? [200, { listings: [mine] }] : u.startsWith('/api/breeding-listings/mine') ? [200, { listings: [{ ...breeding, photos: [] }] }] : null)])
    mount('/my-listings')
    const link = await screen.findByRole('link', { name: feeder.headline })
    expect(link.closest('div[class*="items-center gap-4"]')!.querySelector('img')).toHaveAttribute('src', `${BASE}/1_thumb.jpg`)
  })
})

describe('staff review', () => {
  it('shows every photo (full size on click) and the documents before approving', async () => {
    stubApi(
      [(u) => (u.startsWith('/api/feeder-listings/queue') ? [200, { listings: [{ ...mine, status: 'pending' }] }] : null)],
      staff,
    )
    mount('/staff/review', staff)
    await screen.findByRole('link', { name: feeder.headline })
    expect(screen.getByRole('link', { name: 'Open photo 2 full size' })).toHaveAttribute('href', `${BASE}/2.jpg`)
    expect(screen.getByRole('button', { name: 'Download Health Records.pdf' })).toBeInTheDocument()
  })
})
