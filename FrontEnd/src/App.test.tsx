import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

afterEach(() => {
  vi.restoreAllMocks()
})

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  )
}

describe('Home page', () => {
  it('shows the title and buttons', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderApp()
    expect(
      screen.getByRole('heading', { name: 'Red Angus Marketing Portal' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /search cattle/i })).toBeInTheDocument()
  })

  it('shows connected when the API answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ status: 'ok', service: 'raaaa-api', timestamp: 'now' }),
      })),
    )
    renderApp()
    await waitFor(() => expect(screen.getByText('connected')).toBeInTheDocument())
  })

  it('shows not reachable when the API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network')
      }),
    )
    renderApp()
    await waitFor(() => expect(screen.getByText('not reachable')).toBeInTheDocument())
  })
})
