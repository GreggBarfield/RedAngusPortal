import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App'

const member = { id: '1', email: 'm@x.com', displayName: 'Member Ranch', membershipNumber: '1', membershipStatus: 'verified', role: 'member' }

const feeder = {
  id: '9',
  groupId: 'BARFIELD100',
  headline: '40 steers and 20 heifers - Red Angus, 583 lbs',
  steerCount: 40,
  heiferCount: 20,
  headCount: 60,
  breeds: ['Red Angus'],
  preconditioning: [],
  special: [],
  vaccinations: [],
  marketingMethod: 'off_ranch',
  marketingDate: '2026-11-15',
  city: 'Bryan',
  state: 'TX',
  priceBasis: 'per_cwt',
  askingPrice: 1.85,
  callForPrice: false,
  status: 'approved',
  photos: [],
  attachmentCount: 0,
}
const forMember = { ...feeder, attachments: [], contactName: 'Sam', contactPhone: '979-555-0100', contactEmail: 'sam@x.com', mine: false }
const breeding = {
  id: '4',
  headline: '3 Red Angus Bulls',
  headCount: 3,
  sexClass: 'bull',
  breeds: ['Red Angus'],
  saleType: 'private_treaty',
  saleDate: '2026-11-15',
  state: 'TX',
  askingPrice: null,
  callForPrice: true,
  epds: [],
  status: 'approved',
  photos: [],
  attachmentCount: 0,
}

type Handler = (url: string, init?: RequestInit) => [number, unknown] | null
let calls: { url: string; init?: RequestInit }[] = []

function stubApi(handlers: Handler[], signedIn = true) {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (url.startsWith('/api/auth/me')) return Promise.resolve(new Response(JSON.stringify(signedIn ? { user: member } : { error: 'unauthorized' }), { status: signedIn ? 200 : 401 }))
      for (const h of handlers) {
        const r = h(url, init)
        if (r) return Promise.resolve(new Response(JSON.stringify(r[1]), { status: r[0] }))
      }
      return Promise.resolve(new Response(JSON.stringify({ error: 'not_found' }), { status: 404 }))
    }),
  )
}

function mount(path: string, signedIn = true) {
  if (signedIn) localStorage.setItem('raaaa_token', 'tok')
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('data sheet download', () => {
  it('a signed-in member downloads the sheet with the sign-in header', async () => {
    const link: { download: string; href: string }[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      link.push({ download: this.download, href: this.href })
    })
    URL.createObjectURL = vi.fn(() => 'blob:fake')
    URL.revokeObjectURL = vi.fn()
    stubApi([(u) => (u === '/api/feeder-listings/9' ? [200, { listing: forMember }] : null), (u) => (u === '/api/feeder-listings/9/datasheet' ? [200, { fake: 'pdf bytes' }] : null)])
    mount('/feeder/9')
    fireEvent.click(await screen.findByRole('button', { name: 'Download data sheet' }))
    await waitFor(() => expect(link).toHaveLength(1))
    expect(link[0]).toEqual({ download: 'RedAngus_FeederDataSheet_9.pdf', href: 'blob:fake' })
    const get = calls.find((c) => c.url === '/api/feeder-listings/9/datasheet')!
    expect((get.init!.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(await screen.findByRole('button', { name: 'Download data sheet' })).toBeEnabled()
  })

  it('a visitor is asked to sign in and gets no button', async () => {
    stubApi([(u) => (u === '/api/feeder-listings/9' ? [200, { listing: feeder }] : null)], false)
    mount('/feeder/9', false)
    await screen.findByRole('heading', { name: feeder.headline })
    expect(screen.queryByRole('button', { name: /data sheet/i })).toBeNull()
    expect(screen.getByRole('link', { name: 'Sign in to download the data sheet' })).toHaveAttribute('href', '/login')
    expect(calls.some((c) => c.url.includes('/datasheet'))).toBe(false)
  })

  it('breeding listings have no data sheet yet', async () => {
    stubApi([(u) => (u === '/api/breeding-listings/4' ? [200, { listing: { ...breeding, contactName: 'Sam', contactPhone: '1', contactEmail: 'a@b.c', mine: false } }] : null)])
    mount('/breeding/4')
    await screen.findByRole('heading', { name: breeding.headline })
    expect(screen.queryByRole('button', { name: /data sheet/i })).toBeNull()
  })

  it.each([
    [503, 'The data sheet is not available right now. Try again later.'],
    [429, 'Too many data sheet downloads. Try again in a while.'],
    [502, 'Could not make the data sheet. Try again.'],
  ])('a %i answer says so in plain words', async (status, message) => {
    URL.createObjectURL = vi.fn(() => 'blob:fake')
    stubApi([(u) => (u === '/api/feeder-listings/9' ? [200, { listing: forMember }] : null), (u) => (u.endsWith('/datasheet') ? [status, { error: 'x' }] : null)])
    mount('/feeder/9')
    fireEvent.click(await screen.findByRole('button', { name: 'Download data sheet' }))
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})
