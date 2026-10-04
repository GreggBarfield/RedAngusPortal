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
const member = { ...staff, id: '1', displayName: 'Member Person', role: 'member' }

const publicBarn = { auctionNo: 7, name: 'Test Livestock Auction', city: 'Bryan', state: 'TX', category: 'REG', isActive: true }
const fullBarn = {
  ...publicBarn,
  address: '1 Main St',
  zip: '77801',
  email: 'sales@test.example',
  phone: '979-555-0100',
  fax: '979-555-0101',
  contactName: 'Sam Seller',
  btnPreferredMethod: 'fax',
  sendMethod: null,
  enabled: true,
  notes: null,
}

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

describe('barn list', () => {
  it('shows names to a visitor, with no contact details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.startsWith('/api/barns/states')) return reply(200, { states: [{ state: 'TX', n: 1 }] })
        return reply(200, { total: 1, page: 1, pageSize: 25, barns: [publicBarn] })
      }),
    )
    mount('/barns')
    expect(await screen.findByRole('link', { name: 'Test Livestock Auction' })).toBeInTheDocument()
    expect(screen.getByText(/sign in to see fax numbers/i)).toBeInTheDocument()
    expect(screen.queryByText(/979-555-0101/)).toBeNull()
  })

  it('shows fax and email when signed in', async () => {
    localStorage.setItem('raaaa_token', 'tok')
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.startsWith('/api/auth/me')) return reply(200, { user: member })
        if (url.startsWith('/api/barns/states')) return reply(200, { states: [] })
        return reply(200, { total: 1, page: 1, pageSize: 25, barns: [fullBarn] })
      }),
    )
    mount('/barns')
    expect(await screen.findByText(/Fax 979-555-0101/)).toBeInTheDocument()
  })

  it('sends the search words to the API', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith('/api/barns/states')) return reply(200, { states: [] })
      return reply(200, { total: 0, page: 1, pageSize: 25, barns: [] })
    })
    vi.stubGlobal('fetch', fetchMock)
    mount('/barns')
    await screen.findByText(/no barns match/i)
    fireEvent.change(screen.getByLabelText('Search name or city'), { target: { value: 'bryan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('q=bryan'))).toBe(true))
  })
})

describe('barn detail', () => {
  it('asks a visitor to sign in for contacts', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply(200, { barn: publicBarn })))
    mount('/barns/7')
    expect(await screen.findByRole('heading', { name: 'Test Livestock Auction' })).toBeInTheDocument()
    expect(screen.getByText(/to see this barn/i)).toBeInTheDocument()
  })

  it('a member sees contacts but no edit form', async () => {
    localStorage.setItem('raaaa_token', 'tok')
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.startsWith('/api/auth/me')) return reply(200, { user: member })
        return reply(200, { barn: fullBarn })
      }),
    )
    mount('/barns/7')
    expect(await screen.findByText('979-555-0101')).toBeInTheDocument()
    expect(screen.queryByText(/edit contact/i)).toBeNull()
  })

  it('staff: warns when BTN changed, then overwrites on request', async () => {
    localStorage.setItem('raaaa_token', 'tok')
    const patches: unknown[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.startsWith('/api/auth/me')) return reply(200, { user: staff })
        if (url.endsWith('/log')) return reply(200, { log: [] })
        if (url.endsWith('/contact') && init?.method === 'PATCH') {
          const body = JSON.parse(String(init.body))
          patches.push(body)
          if (!body.overwrite) {
            return reply(409, {
              error: 'conflict',
              conflicts: ['fax'],
              current: { email: 'sales@test.example', phone: '979-555-0100', fax: '979-555-0777', contactName: 'Sam Seller' },
            })
          }
          return reply(200, { changed: [{ field: 'fax', oldValue: '979-555-0777', newValue: '979-555-0199' }], logged: true })
        }
        return reply(200, { barn: fullBarn })
      }),
    )
    mount('/barns/7')
    const fax = await screen.findByLabelText('Fax')
    fireEvent.change(fax, { target: { value: '979-555-0199' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save contact' }))
    expect(await screen.findByText(/BTN has different information/i)).toBeInTheDocument()
    expect(screen.getByText(/BTN now has 979-555-0777/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Overwrite BTN' }))
    expect(await screen.findByText(/Saved here and in BTN/i)).toBeInTheDocument()
    expect(patches).toHaveLength(2)
    expect(patches[0]).toMatchObject({ changes: { fax: '979-555-0199' }, expected: { fax: '979-555-0101' }, overwrite: false })
    expect(patches[1]).toMatchObject({ overwrite: true })
  })

  it('staff: nothing changed means nothing sent', async () => {
    localStorage.setItem('raaaa_token', 'tok')
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith('/api/auth/me')) return reply(200, { user: staff })
      if (url.endsWith('/log')) return reply(200, { log: [] })
      return reply(200, { barn: fullBarn })
    })
    vi.stubGlobal('fetch', fetchMock)
    mount('/barns/7')
    await screen.findByLabelText('Fax')
    fireEvent.click(screen.getByRole('button', { name: 'Save contact' }))
    expect(await screen.findByText(/nothing has been changed/i)).toBeInTheDocument()
    expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'PATCH')).toBe(false)
  })
})
