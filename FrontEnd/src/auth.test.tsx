import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App'

const user = {
  id: '1',
  email: 'a@b.com',
  displayName: 'Test Ranch',
  membershipNumber: 'RA-123',
  membershipStatus: 'unverified',
  role: 'member',
}

function json(status: number, body: unknown) {
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

describe('auth screens', () => {
  it('shows Sign in and Create account in the header when signed out', () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, {})))
    mount('/')
    expect(screen.getAllByRole('link', { name: /sign in/i }).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: /create account/i })).toBeInTheDocument()
  })

  it('redirects /account to login when signed out', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, {})))
    mount('/account')
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })

  it('logs in, stores the token and shows the account page', async () => {
    const fetchMock = vi.fn(() => json(200, { token: 'tok', user }))
    vi.stubGlobal('fetch', fetchMock)
    mount('/login')
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longenoughpw' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByRole('heading', { name: /your account/i })).toBeInTheDocument()
    expect(screen.getByText('RA-123')).toBeInTheDocument()
    expect(localStorage.getItem('raaaa_token')).toBe('tok')
  })

  it('shows a message on bad credentials', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(401, { error: 'invalid_credentials' })))
    mount('/login')
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrongpassword' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/not right/i)
    expect(localStorage.getItem('raaaa_token')).toBeNull()
  })

  it('shows field errors from the API on register', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => json(409, { error: 'email_taken', fields: { email: 'That email is already registered.' } })),
    )
    mount('/register')
    fireEvent.change(screen.getByLabelText('Name or ranch'), { target: { value: 'Test Ranch' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText('Membership number'), { target: { value: 'RA-123' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longenoughpw' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'longenoughpw' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByText(/already registered/i)).toBeInTheDocument()
  })

  it('does not call the API when the two passwords differ', async () => {
    const fetchMock = vi.fn(() => json(201, {}))
    vi.stubGlobal('fetch', fetchMock)
    mount('/register')
    fireEvent.change(screen.getByLabelText('Name or ranch'), { target: { value: 'Test Ranch' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText('Membership number'), { target: { value: 'RA-123' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longenoughpw' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'different-pw-here' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByText(/do not match/i)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('restores a saved session from /api/auth/me and signs out', async () => {
    localStorage.setItem('raaaa_token', 'tok')
    const fetchMock = vi.fn(() => json(200, { user }))
    vi.stubGlobal('fetch', fetchMock)
    mount('/account')
    expect(await screen.findByRole('heading', { name: /your account/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /test ranch/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /sign out/i }))
    await waitFor(() => expect(localStorage.getItem('raaaa_token')).toBeNull())
    expect(screen.getByRole('link', { name: /create account/i })).toBeInTheDocument()
  })

  it('drops a token the server rejects', async () => {
    localStorage.setItem('raaaa_token', 'old')
    vi.stubGlobal('fetch', vi.fn(() => json(401, { error: 'unauthorized' })))
    mount('/account')
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    expect(localStorage.getItem('raaaa_token')).toBeNull()
  })
})
