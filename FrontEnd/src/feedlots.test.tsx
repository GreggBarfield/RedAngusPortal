import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

const publicLot = { id: 12, name: 'Pinal Feeding Co.-Maricopa', city: 'Maricopa', state: 'AZ', website: 'www.pinalfeeding.com' }
const memberLot = {
  ...publicLot,
  address: '38351 W Cowtown Rd',
  zip: '85138',
  contactName: 'Earl Petznick',
  phone: '(602) 252-3467',
  emails: ['info@pinalfeeding.com', 'orders@pinalfeeding.com'],
  fax: '(602) 555-0100',
}
const staffLot = {
  ...memberLot,
  notes: 'Prefers morning calls.',
  enabled: true,
  doNotEmail: false,
  doNotEmailAt: null,
  doNotEmailNote: null,
  createdAt: '2026-10-07T12:00:00Z',
  updatedAt: '2026-10-07T12:00:00Z',
}
const stats = { total: 785, enabled: 780, withEmail: 343, canEmail: 340, doNotEmail: 3, withFax: 1 }

function reply(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

type Handler = (url: string, init?: RequestInit) => Promise<Response> | undefined

// A fake server: the first handler that answers wins; the sign-in check and the staff review
// count are answered for every test.
function serve(role: 'visitor' | 'member' | 'staff', ...handlers: Handler[]) {
  if (role !== 'visitor') localStorage.setItem('raaaa_token', 'tok')
  const user = role === 'staff' ? staff : member
  const fn = vi.fn((url: string, init?: RequestInit) => {
    for (const h of handlers) {
      const r = h(url, init)
      if (r) return r
    }
    if (url.startsWith('/api/auth/me')) return reply(200, { user })
    if (url.includes('pending-count')) return reply(200, { pending: 0 })
    if (url.startsWith('/api/feedlots/states')) return reply(200, { states: [{ state: 'AZ', n: 1 }] })
    if (url.startsWith('/api/feedlots/stats')) return reply(200, { stats })
    return reply(404, { error: 'not_found' })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

const list = (lots: unknown[], total = lots.length): Handler => (url) =>
  /^\/api\/feedlots(\?|$)/.test(url) ? reply(200, { total, page: 1, pageSize: 25, feedlots: lots }) : undefined

function mount(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

const calls = (fn: ReturnType<typeof vi.fn>, method: string, prefix: string) =>
  fn.mock.calls.filter((c) => String(c[0]).startsWith(prefix) && ((c[1] as RequestInit | undefined)?.method ?? 'GET') === method)

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('feedlot list', () => {
  it('shows a visitor names and places only', async () => {
    serve('visitor', list([publicLot]))
    mount('/feedlots')
    expect(await screen.findByRole('link', { name: 'Pinal Feeding Co.-Maricopa' })).toBeInTheDocument()
    expect(screen.getByText(/sign in to see phone numbers/i)).toBeInTheDocument()
    expect(screen.queryByText(/602/)).toBeNull()
    expect(screen.queryByRole('link', { name: 'Add feedlot' })).toBeNull()
    expect(screen.queryByLabelText('Email')).toBeNull()
    expect(screen.getByLabelText('Search name or city')).toBeInTheDocument()
  })

  it('shows a signed-in member phone, emails and fax, but nothing staff-only', async () => {
    serve('member', list([memberLot]))
    mount('/feedlots')
    expect(await screen.findByText(/\(602\) 252-3467 - info@pinalfeeding.com, orders@pinalfeeding.com - Fax \(602\) 555-0100/)).toBeInTheDocument()
    expect(screen.getByLabelText('Search name, city or contact')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.queryByLabelText('Show')).toBeNull()
    expect(screen.queryByTestId('feedlot-stats')).toBeNull()
  })

  it('gives staff the counts, an Add button and the status badges', async () => {
    serve('staff', list([{ ...staffLot, enabled: false, doNotEmail: true }]))
    mount('/feedlots')
    expect(await screen.findByTestId('feedlot-stats')).toHaveTextContent(
      '785 feedlots - 343 with an email - 340 can be emailed - 3 do not email - 1 with a fax number',
    )
    expect(screen.getByRole('link', { name: 'Add feedlot' })).toHaveAttribute('href', '/feedlots/new')
    expect(await screen.findByText('Retired')).toBeInTheDocument()
    // once as the badge on the feedlot, once as a choice in the Show menu
    expect(screen.getAllByText('Do not email')).toHaveLength(2)
  })

  it('passes the search, state and filters to the API', async () => {
    const fn = serve('staff', list([staffLot]))
    mount('/feedlots')
    await screen.findByRole('link', { name: 'Pinal Feeding Co.-Maricopa' })

    fireEvent.change(screen.getByLabelText('Search name, city or contact'), { target: { value: 'pinal' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(fn.mock.calls.some((c) => String(c[0]).includes('q=pinal'))).toBe(true))

    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'AZ' } })
    await waitFor(() => expect(fn.mock.calls.some((c) => String(c[0]).includes('state=AZ'))).toBe(true))

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: '1' } })
    await waitFor(() => expect(fn.mock.calls.some((c) => String(c[0]).includes('hasEmail=1'))).toBe(true))

    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'retired' } })
    await waitFor(() => expect(fn.mock.calls.some((c) => String(c[0]).includes('enabled=0'))).toBe(true))

    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'dnm' } })
    await waitFor(() => expect(fn.mock.calls.some((c) => String(c[0]).includes('doNotEmail=1'))).toBe(true))
  })

  it('pages through a long list', async () => {
    const fn = serve('visitor', list([publicLot], 785))
    mount('/feedlots')
    expect(await screen.findByText('Page 1 of 32')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(fn.mock.calls.some((c) => String(c[0]).includes('page=2'))).toBe(true))
  })

  it('says so when nothing matches, and when the list cannot load', async () => {
    serve('visitor', list([], 0))
    mount('/feedlots')
    expect(await screen.findByText('No feedlots match.')).toBeInTheDocument()
  })

  it('shows an error when the list cannot be loaded', async () => {
    serve('visitor', (url) => (/^\/api\/feedlots(\?|$)/.test(url) ? reply(500, { error: 'server_error' }) : undefined))
    mount('/feedlots')
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the feedlot list')
  })
})

describe('feedlot detail', () => {
  const one = (lot: unknown): Handler => (url, init) =>
    url === '/api/feedlots/12' && (!init || !init.method || init.method === 'GET') ? reply(200, { feedlot: lot }) : undefined

  it('asks a visitor to sign in, and links the website with https', async () => {
    serve('visitor', one(publicLot))
    mount('/feedlots/12')
    expect(await screen.findByRole('heading', { name: 'Pinal Feeding Co.-Maricopa' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'www.pinalfeeding.com' })).toHaveAttribute('href', 'https://www.pinalfeeding.com')
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByText('Contact')).toBeNull()
  })

  it('shows a member the contact card and no editing', async () => {
    serve('member', one(memberLot))
    mount('/feedlots/12')
    expect(await screen.findByText('Earl Petznick')).toBeInTheDocument()
    expect(screen.getByText('info@pinalfeeding.com, orders@pinalfeeding.com')).toBeInTheDocument()
    expect(screen.getByText('(602) 555-0100')).toBeInTheDocument()
    expect(screen.queryByText(/Edit feedlot/)).toBeNull()
    expect(screen.queryByText(/Remove this feedlot/)).toBeNull()
  })

  it('says not found for an unknown feedlot', async () => {
    serve('visitor')
    mount('/feedlots/999')
    expect(await screen.findByText('Feedlot not found')).toBeInTheDocument()
  })

  const staffServer = (extra: Handler[] = []) =>
    serve(
      'staff',
      ...extra,
      one(staffLot),
      (url) =>
        url === '/api/feedlots/12/log'
          ? reply(200, {
              log: [
                { id: '2', field: 'fax', oldValue: null, newValue: '(602) 555-0100', changedAt: '2026-10-07T13:00:00Z', changedBy: 'Staff Person' },
                { id: '1', field: 'created', oldValue: null, newValue: 'Pinal Feeding Co.-Maricopa (imported)', changedAt: '2026-10-07T12:00:00Z', changedBy: 'Staff Person' },
              ],
            })
          : undefined,
    )

  it('gives staff the edit form filled in, the notes and the change log', async () => {
    staffServer()
    mount('/feedlots/12')
    expect(await screen.findByText('Edit feedlot (staff)')).toBeInTheDocument()
    expect(screen.getByLabelText('Feedlot name')).toHaveValue('Pinal Feeding Co.-Maricopa')
    expect(screen.getByLabelText('Email addresses')).toHaveValue('info@pinalfeeding.com\norders@pinalfeeding.com')
    expect(screen.getByLabelText('Staff notes')).toHaveValue('Prefers morning calls.')
    expect(screen.getByLabelText('Fax number')).toHaveValue('(602) 555-0100')
    expect(await screen.findByText(/Staff Person changed the fax number from \(empty\) to \(602\) 555-0100/)).toBeInTheDocument()
    expect(screen.getByText(/Staff Person added this feedlot/)).toBeInTheDocument()
  })

  it('saves only what was changed', async () => {
    const fn = staffServer([
      (url, init) =>
        url === '/api/feedlots/12' && init?.method === 'PATCH'
          ? reply(200, { feedlot: { ...staffLot, fax: '(806) 668-4744', updatedAt: '2026-10-07T14:00:00Z' }, changed: [] })
          : undefined,
    ])
    mount('/feedlots/12')
    const fax = await screen.findByLabelText('Fax number')
    fireEvent.change(fax, { target: { value: '(806) 668-4744' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    const patch = calls(fn, 'PATCH', '/api/feedlots/12')
    expect(patch).toHaveLength(1)
    expect(JSON.parse(String((patch[0][1] as RequestInit).body))).toEqual({ changes: { fax: '(806) 668-4744' } })
  })

  it('does not call the server when nothing was changed', async () => {
    const fn = staffServer()
    mount('/feedlots/12')
    await screen.findByLabelText('Fax number')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Nothing has been changed.')).toBeInTheDocument()
    expect(calls(fn, 'PATCH', '/api/feedlots/12')).toHaveLength(0)
  })

  it('sends changed email addresses as typed, and ignores a change of order or case only', async () => {
    const fn = staffServer([
      (url, init) => (url === '/api/feedlots/12' && init?.method === 'PATCH' ? reply(200, { feedlot: staffLot, changed: [] }) : undefined),
    ])
    mount('/feedlots/12')
    const emails = await screen.findByLabelText('Email addresses')
    fireEvent.change(emails, { target: { value: 'INFO@pinalfeeding.com, orders@pinalfeeding.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Nothing has been changed.')).toBeInTheDocument()
    fireEvent.change(emails, { target: { value: 'info@pinalfeeding.com; new@pinalfeeding.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(calls(fn, 'PATCH', '/api/feedlots/12')).toHaveLength(1))
    expect(JSON.parse(String((calls(fn, 'PATCH', '/api/feedlots/12')[0][1] as RequestInit).body))).toEqual({
      changes: { emails: 'info@pinalfeeding.com; new@pinalfeeding.com' },
    })
  })

  it('shows the server message next to the field that is wrong', async () => {
    staffServer([
      (url, init) =>
        url === '/api/feedlots/12' && init?.method === 'PATCH'
          ? reply(400, { error: 'validation', fields: { fax: 'Enter one fax number with area code (10 to 15 digits).' } })
          : undefined,
    ])
    mount('/feedlots/12')
    fireEvent.change(await screen.findByLabelText('Fax number'), { target: { value: '123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Enter one fax number with area code (10 to 15 digits).')).toBeInTheDocument()
  })

  it('does-not-email: asks why, and sends the flag with the reason', async () => {
    const fn = staffServer([
      (url, init) => (url === '/api/feedlots/12' && init?.method === 'PATCH' ? reply(200, { feedlot: { ...staffLot, doNotEmail: true }, changed: [] }) : undefined),
    ])
    mount('/feedlots/12')
    const box = await screen.findByLabelText('Do not email this feedlot')
    expect(screen.queryByLabelText('Why (optional)')).toBeNull()
    fireEvent.click(box)
    fireEvent.change(screen.getByLabelText('Why (optional)'), { target: { value: 'Asked by phone' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(calls(fn, 'PATCH', '/api/feedlots/12')).toHaveLength(1))
    expect(JSON.parse(String((calls(fn, 'PATCH', '/api/feedlots/12')[0][1] as RequestInit).body)).changes).toEqual({
      doNotEmail: true,
      doNotEmailNote: 'Asked by phone',
    })
  })

  it('retire: turning off Active sends enabled false', async () => {
    const fn = staffServer([
      (url, init) => (url === '/api/feedlots/12' && init?.method === 'PATCH' ? reply(200, { feedlot: { ...staffLot, enabled: false }, changed: [] }) : undefined),
    ])
    mount('/feedlots/12')
    fireEvent.click(await screen.findByLabelText(/^Active/))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(calls(fn, 'PATCH', '/api/feedlots/12')).toHaveLength(1))
    expect(JSON.parse(String((calls(fn, 'PATCH', '/api/feedlots/12')[0][1] as RequestInit).body)).changes).toEqual({ enabled: false })
  })

  it('a name that clashes with another feedlot is explained', async () => {
    staffServer([(url, init) => (url === '/api/feedlots/12' && init?.method === 'PATCH' ? reply(409, { error: 'duplicate' }) : undefined)])
    mount('/feedlots/12')
    fireEvent.change(await screen.findByLabelText('City'), { target: { value: 'Elsewhere' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Another feedlot already has that name, city and state.')).toBeInTheDocument()
  })

  it('remove: asks first, and Cancel backs out', async () => {
    const fn = staffServer()
    mount('/feedlots/12')
    fireEvent.click(await screen.findByRole('button', { name: 'Remove feedlot' }))
    expect(screen.getByText(/Remove Pinal Feeding Co.-Maricopa for good\? This cannot be undone\./)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Remove feedlot' })).toBeInTheDocument()
    expect(calls(fn, 'DELETE', '/api/feedlots/12')).toHaveLength(0)
  })

  it('remove: confirming deletes it and goes back to the list', async () => {
    const fn = staffServer([
      (url, init) => (url === '/api/feedlots/12' && init?.method === 'DELETE' ? reply(200, { removed: true }) : undefined),
      list([]),
    ])
    mount('/feedlots/12')
    fireEvent.click(await screen.findByRole('button', { name: 'Remove feedlot' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove it' }))
    expect(await screen.findByRole('heading', { name: 'Feedlots' })).toBeInTheDocument()
    expect(calls(fn, 'DELETE', '/api/feedlots/12')).toHaveLength(1)
  })

  it('remove: a failure leaves it in place and says so', async () => {
    staffServer([(url, init) => (url === '/api/feedlots/12' && init?.method === 'DELETE' ? reply(500, { error: 'server_error' }) : undefined)])
    mount('/feedlots/12')
    fireEvent.click(await screen.findByRole('button', { name: 'Remove feedlot' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove it' }))
    expect(await screen.findByText(/Could not remove it\. Nothing was changed/)).toBeInTheDocument()
  })
})

describe('add a feedlot', () => {
  const fill = async (label: string, value: string) => fireEvent.change(await screen.findByLabelText(label), { target: { value } })

  it('is for staff only', async () => {
    serve('member')
    mount('/feedlots/new')
    expect(await screen.findByText('Staff only')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add feedlot' })).toBeNull()
  })

  it('sends a visitor to sign in', async () => {
    serve('visitor')
    mount('/feedlots/new')
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('adds a feedlot and opens its page', async () => {
    const fn = serve(
      'staff',
      (url, init) => (url === '/api/feedlots' && init?.method === 'POST' ? reply(201, { feedlot: { ...staffLot, id: 99, name: 'New Yard' } }) : undefined),
      (url) => (url === '/api/feedlots/99' ? reply(200, { feedlot: { ...staffLot, id: 99, name: 'New Yard' } }) : undefined),
      (url) => (url === '/api/feedlots/99/log' ? reply(200, { log: [] }) : undefined),
    )
    mount('/feedlots/new')
    await fill('Feedlot name', '  New Yard ')
    await fill('State', 'tx')
    await fill('City', 'Lubbock')
    await fill('Email addresses', 'a@x.com, b@x.com')
    await fill('Fax number', '(806) 668-4744')
    fireEvent.click(screen.getByRole('button', { name: 'Add feedlot' }))
    expect(await screen.findByRole('heading', { name: 'New Yard' })).toBeInTheDocument()
    const post = calls(fn, 'POST', '/api/feedlots')
    expect(post).toHaveLength(1)
    expect(JSON.parse(String((post[0][1] as RequestInit).body))).toEqual({
      name: 'New Yard',
      state: 'tx',
      city: 'Lubbock',
      fax: '(806) 668-4744',
      emails: 'a@x.com, b@x.com',
      enabled: true,
      doNotEmail: false,
    })
  })

  it('shows what is wrong, next to each field', async () => {
    serve('staff', (url, init) =>
      url === '/api/feedlots' && init?.method === 'POST'
        ? reply(400, { error: 'validation', fields: { name: 'Enter the feedlot name.', emails: '"nope" is not a valid email address.' } })
        : undefined,
    )
    mount('/feedlots/new')
    await fill('State', 'TX')
    fireEvent.click(screen.getByRole('button', { name: 'Add feedlot' }))
    expect(await screen.findByText('Enter the feedlot name.')).toBeInTheDocument()
    expect(screen.getByText('"nope" is not a valid email address.')).toBeInTheDocument()
  })

  it('explains a feedlot that is already in the list', async () => {
    serve('staff', (url, init) => (url === '/api/feedlots' && init?.method === 'POST' ? reply(409, { error: 'duplicate' }) : undefined))
    mount('/feedlots/new')
    await fill('Feedlot name', 'Dup')
    await fill('State', 'TX')
    fireEvent.click(screen.getByRole('button', { name: 'Add feedlot' }))
    expect(await screen.findByText('A feedlot with that name, city and state is already in the list.')).toBeInTheDocument()
  })
})

describe('menus', () => {
  it('staff get Feedlots in the Staff Tools menu; the footer link is there for everyone', async () => {
    serve('staff', list([staffLot]))
    mount('/feedlots')
    await screen.findByRole('link', { name: 'Pinal Feeding Co.-Maricopa' })
    fireEvent.click(await screen.findByRole('button', { name: /Staff Tools/ }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Feedlots' })).toHaveAttribute('href', '/feedlots')
    expect(within(screen.getByRole('contentinfo')).getByRole('link', { name: 'Feedlots' })).toHaveAttribute('href', '/feedlots')
  })
})
