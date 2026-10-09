import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App'

const staff = { id: '2', email: 's@x.com', displayName: 'Staff Person', membershipNumber: '1', membershipStatus: 'verified', role: 'staff' }
const member = { ...staff, id: '1', displayName: 'Member Person', role: 'member' }

const lot = {
  id: 7, headline: 'Red Angus steers', steerCount: 80, heiferCount: 0, headCount: 80, avgWeightSteers: 575, avgWeightHeifers: null, avgWeight: null,
  marketingMethod: 'off_ranch', auctionName: null, marketingDate: '2026-10-20', city: 'Gonzales', state: 'TX', priceBasis: null, askingPrice: null,
  callForPrice: true, contactName: 'Pat Seller', contactPhone: '555', contactEmail: 'pat@x.com', breeds: ['Red Angus'],
}
const lot2 = { ...lot, id: 8, headline: 'Heifers' }
const feedA = { id: 10, name: 'Pinal Feeding', city: 'Maricopa', state: 'AZ', emails: ['a@pinal.com', 'b@pinal.com'], lastSent: null }
const feedB = { id: 11, name: 'Cactus Feeders', city: 'Hereford', state: 'TX', emails: ['c@cactus.com'], lastSent: '2026-10-01T12:00:00Z' }
const feedC = { id: 12, name: 'Sunbelt Yard', city: 'Dumas', state: 'TX', emails: ['A@pinal.com'], lastSent: null }
const readyStatus = { configured: true, missing: [], from: 'info@blocktrustnetwork.com', replyTo: 'info@blocktrustnetwork.com', sending: false }

function reply(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}
type Handler = (url: string, init?: RequestInit) => Promise<Response> | undefined

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
    if (url === '/api/showlists/status') return reply(200, readyStatus)
    if (url === '/api/showlists/lots') return reply(200, { lots: [lot, lot2] })
    if (url === '/api/showlists/recipients') return reply(200, { blocked: 3, feedlots: [feedA, feedB, feedC] })
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
const posts = (fn: ReturnType<typeof vi.fn>, url: string) => fn.mock.calls.filter((c) => c[0] === url && (c[1] as RequestInit | undefined)?.method === 'POST')
const bodyOf = (c: unknown[]) => JSON.parse(String((c[1] as RequestInit).body))

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('send a showlist', () => {
  it('is for staff only', async () => {
    serve('member')
    mount('/staff/showlists/new')
    expect(await screen.findByText('Staff only')).toBeInTheDocument()
    expect(screen.queryByText('Send a showlist')).toBeNull()
  })

  it('lists the cattle and feedlots, with everything emailable ticked and the counts right', async () => {
    serve('staff')
    mount('/staff/showlists/new')
    expect(await screen.findByLabelText('Include Red Angus steers')).not.toBeChecked()
    expect(screen.getByLabelText('Email Pinal Feeding')).toBeChecked()
    expect(screen.getByText(/3 more are left out because they are marked Do not email/)).toBeInTheDocument()
    // a@pinal.com is on two feedlots, so 4 addresses become 3 emails
    expect(screen.getByTestId('feedlot-count')).toHaveTextContent('3 feedlots ticked - 3 email addresses')
    expect(screen.getByText(/Emails go out from info@blocktrustnetwork.com/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send to 3 feedlots' })).toBeDisabled() // no cattle picked yet
  })

  it('filters the feedlot list and ticks or unticks what is shown', async () => {
    serve('staff')
    mount('/staff/showlists/new')
    await screen.findByLabelText('Email Pinal Feeding')
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'TX' } })
    expect(screen.queryByLabelText('Email Pinal Feeding')).toBeNull()
    expect(screen.getByLabelText('Email Cactus Feeders')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Untick all shown/ }))
    expect(screen.getByTestId('feedlot-count')).toHaveTextContent('1 feedlots ticked')
    fireEvent.click(screen.getByRole('button', { name: /Tick all shown \(2\)/ }))
    expect(screen.getByTestId('feedlot-count')).toHaveTextContent('3 feedlots ticked')

    fireEvent.change(screen.getByLabelText('State'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Last emailed'), { target: { value: '30' } })
    expect(screen.queryByLabelText('Email Cactus Feeders')).toBeNull() // emailed 6 days ago
    expect(screen.getByLabelText('Email Pinal Feeding')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Last emailed'), { target: { value: 'never' } })
    expect(screen.queryByLabelText('Email Cactus Feeders')).toBeNull()
    fireEvent.change(screen.getByLabelText('Last emailed'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Search name or city'), { target: { value: 'sunbelt' } })
    expect(screen.getAllByRole('checkbox', { name: /^Email / })).toHaveLength(1)
  })

  it('shows the preview in a sandboxed frame', async () => {
    const fn = serve('staff', (url) => (url === '/api/showlists/preview' ? reply(200, { subject: 'S', html: '<p>PREVIEW BODY</p>', text: 't' }) : undefined))
    mount('/staff/showlists/new')
    fireEvent.click(await screen.findByLabelText('Include Red Angus steers'))
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    const frame = await screen.findByTitle('Preview of the email')
    expect(frame).toHaveAttribute('sandbox', '')
    expect(frame).toHaveAttribute('srcdoc', '<p>PREVIEW BODY</p>')
    expect(bodyOf(posts(fn, '/api/showlists/preview')[0])).toEqual({ subject: 'Red Angus feeder cattle for sale', intro: '', lotIds: [7] })
  })

  it('sends a test to the typed address', async () => {
    const fn = serve('staff', (url) => (url === '/api/showlists/test' ? reply(200, { sent: true, to: 's@x.com' }) : undefined))
    mount('/staff/showlists/new')
    fireEvent.click(await screen.findByLabelText('Include Red Angus steers'))
    await waitFor(() => expect(screen.getByLabelText('Send a test to')).toHaveValue('s@x.com'))
    fireEvent.click(screen.getByRole('button', { name: 'Send test' }))
    expect(await screen.findByText(/Test email sent to s@x.com/)).toBeInTheDocument()
    expect(bodyOf(posts(fn, '/api/showlists/test')[0])).toMatchObject({ to: 's@x.com', lotIds: [7] })
  })

  it('asks before sending, then sends exactly what is ticked and opens the results page', async () => {
    const fn = serve(
      'staff',
      (url) => (url === '/api/showlists' ? reply(202, { showlist: { id: 55, recipientCount: 2 } }) : undefined),
      (url) => (url === '/api/showlists/55' ? reply(200, detail({ DELIVERED: 0, SUBMITTED: 2 }, [])) : undefined),
    )
    mount('/staff/showlists/new')
    fireEvent.click(await screen.findByLabelText('Include Red Angus steers'))
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Fall steers' } })
    fireEvent.change(screen.getByLabelText('Note above the table (optional)'), { target: { value: 'Hello there' } })
    fireEvent.click(screen.getByLabelText('Email Cactus Feeders')) // untick one
    fireEvent.click(screen.getByRole('button', { name: 'Send to 2 feedlots' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent('Send 1 lot to 2 feedlots (2 email addresses)?')
    expect(posts(fn, '/api/showlists')).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Send to 2 feedlots' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, send now' }))
    expect(await screen.findByTestId('showlist-counts')).toBeInTheDocument()
    expect(bodyOf(posts(fn, '/api/showlists')[0])).toEqual({ subject: 'Fall steers', intro: 'Hello there', lotIds: [7], feedlotIds: [10, 12] })
  })

  it('tells staff when email is not set up, and will not send', async () => {
    serve('staff', (url) => (url === '/api/showlists/status' ? reply(200, { ...readyStatus, configured: false, missing: ['SMTP2GO_API_KEY'] }) : undefined))
    mount('/staff/showlists/new')
    expect(await screen.findByText(/Email is not set up on the server yet/)).toHaveTextContent('SMTP2GO_API_KEY')
    fireEvent.click(await screen.findByLabelText('Include Red Angus steers'))
    expect(screen.getByRole('button', { name: 'Send to 3 feedlots' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send test' })).toBeDisabled()
  })

  it('shows a refusal from the server in plain words and sends nothing more', async () => {
    serve('staff', (url) => (url === '/api/showlists' ? reply(409, { error: 'busy', message: 'A showlist is still being sent (or is waiting to be resumed).' }) : undefined))
    mount('/staff/showlists/new')
    fireEvent.click(await screen.findByLabelText('Include Red Angus steers'))
    fireEvent.click(screen.getByRole('button', { name: 'Send to 3 feedlots' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, send now' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('still being sent')
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})

function detail(counts: Record<string, number>, sends: unknown[], active = false) {
  return {
    showlist: { id: 55, subject: 'Fall steers', intro: '', recipientCount: 2, createdAt: '2026-10-09T15:00:00Z', createdBy: 'Staff Person', lots: [{ id: 7, headline: 'Red Angus steers' }] },
    counts: { QUEUED: 0, SENDING: 0, SUBMITTED: 0, DELIVERED: 0, FAILED: 0, SUBMIT_FAILED: 0, ...counts },
    active,
    sends,
  }
}
const send = (over: Record<string, unknown>) => ({
  id: 1, feedlotId: 10, feedlotName: 'Pinal Feeding', recipient: 'a@pinal.com', status: 'DELIVERED', detail: null,
  submittedAt: '2026-10-09T15:00:00Z', deliveredAt: '2026-10-09T15:01:00Z', failedAt: null, unsubscribedAt: null, ...over,
})

describe('showlist history and results', () => {
  it('lists past showlists with plain counts', async () => {
    serve('staff', (url) =>
      url === '/api/showlists'
        ? reply(200, {
            sending: false,
            showlists: [{ id: 55, subject: 'Fall steers', recipientCount: 3, lotCount: 1, createdAt: '2026-10-09T15:00:00Z', createdBy: 'Staff Person', counts: { QUEUED: 1, SENDING: 0, SUBMITTED: 1, DELIVERED: 1, FAILED: 0, SUBMIT_FAILED: 0 } }],
          })
        : undefined,
    )
    mount('/staff/showlists')
    const link = await screen.findByRole('link', { name: 'Fall steers' })
    expect(link).toHaveAttribute('href', '/staff/showlists/55')
    expect(screen.getByText('2 sent - 1 delivered - 1 waiting')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Send a showlist' })).toHaveAttribute('href', '/staff/showlists/new')
  })

  it('shows each email with its result, and can filter', async () => {
    serve('staff', (url) =>
      url === '/api/showlists/55'
        ? reply(200, detail({ DELIVERED: 1, FAILED: 1 }, [send({}), send({ id: 2, feedlotName: 'Cactus', recipient: 'c@cactus.com', status: 'FAILED', detail: '{"event":"bounce"}', deliveredAt: null, failedAt: '2026-10-09T15:02:00Z', unsubscribedAt: '2026-10-09T16:00:00Z' })]))
        : undefined,
    )
    mount('/staff/showlists/55')
    expect(await screen.findByText('a@pinal.com')).toBeInTheDocument()
    expect(screen.getByText('c@cactus.com')).toBeInTheDocument()
    expect(screen.getByText('Unsubscribed')).toBeInTheDocument()
    expect(screen.getByText('{"event":"bounce"}')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'FAILED' } })
    expect(screen.queryByText('a@pinal.com')).toBeNull()
    expect(screen.getByText('c@cactus.com')).toBeInTheDocument()
  })

  it('offers to send the rest when emails are waiting and nothing is sending them', async () => {
    const fn = serve(
      'staff',
      (url) => (url === '/api/showlists/55/resume' ? reply(202, { resumed: true, waiting: 4 }) : undefined),
      (url) => (url === '/api/showlists/55' ? reply(200, detail({ QUEUED: 4, SUBMITTED: 1 }, [send({ status: 'SUBMITTED', deliveredAt: null })], false)) : undefined),
    )
    mount('/staff/showlists/55')
    expect(await screen.findByText(/4 emails are still waiting/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Send the rest' }))
    expect(await screen.findByText('Sending again.')).toBeInTheDocument()
    expect(posts(fn, '/api/showlists/55/resume')).toHaveLength(1)
  })

  it('does not offer to resume while it is being sent', async () => {
    serve('staff', (url) => (url === '/api/showlists/55' ? reply(200, detail({ QUEUED: 4 }, [], true)) : undefined))
    mount('/staff/showlists/55')
    expect(await screen.findByText(/Sending now/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send the rest' })).toBeNull()
  })
})

describe('unsubscribe page', () => {
  const tok = 'a'.repeat(32)

  it('opening the link changes nothing; the button does', async () => {
    const fn = serve('visitor', (url, init) => {
      if (url === `/api/unsubscribe/${tok}` && !init?.method) return reply(200, { feedlotName: 'Pinal Feeding', alreadyOff: false })
      if (url === `/api/unsubscribe/${tok}` && init?.method === 'POST') return reply(200, { done: true, feedlotName: 'Pinal Feeding' })
      return undefined
    })
    mount(`/unsubscribe/${tok}`)
    expect(await screen.findByText('Pinal Feeding')).toBeInTheDocument()
    expect(posts(fn, `/api/unsubscribe/${tok}`)).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Yes, unsubscribe' }))
    expect(await screen.findByText(/will not be emailed again/)).toBeInTheDocument()
    expect(posts(fn, `/api/unsubscribe/${tok}`)).toHaveLength(1)
  })

  it('says so when the feedlot is already off, and when the link is not valid', async () => {
    serve('visitor', (url) => (url === `/api/unsubscribe/${tok}` ? reply(200, { feedlotName: 'Pinal Feeding', alreadyOff: true }) : undefined))
    mount(`/unsubscribe/${tok}`)
    expect(await screen.findByText(/already unsubscribed/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Yes, unsubscribe' })).toBeNull()
    vi.unstubAllGlobals()
    serve('visitor', (url) => (url.startsWith('/api/unsubscribe/') ? reply(404, { error: 'not_found' }) : undefined))
    mount('/unsubscribe/nope')
    expect(await screen.findByText(/This link is not valid/)).toBeInTheDocument()
  })
})

describe('menu', () => {
  it('staff get a Showlists link under Staff Tools', async () => {
    serve('staff')
    mount('/')
    fireEvent.click(await screen.findByRole('button', { name: /Staff Tools/ }))
    expect(screen.getByRole('menuitem', { name: 'Showlists' })).toHaveAttribute('href', '/staff/showlists')
  })
})
