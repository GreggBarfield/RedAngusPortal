import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  )
}

describe('Home page and menu', () => {
  it('shows the title and the two main choices', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderApp()
    expect(screen.getByRole('heading', { name: 'Red Angus Marketing Portal' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /search for cattle/i }).length).toBeGreaterThan(0)
    const menu = screen.getAllByRole('link', { name: /list your cattle/i })
    expect(menu.length).toBeGreaterThan(0)
  })

  it('main menu goes to the feeder tabs first', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderApp()
    const search = screen.getAllByRole('link', { name: /search for cattle/i })
    expect(search.some((a) => a.getAttribute('href') === '/search/feeder')).toBe(true)
    const list = screen.getAllByRole('link', { name: /list your cattle/i })
    expect(list.some((a) => a.getAttribute('href') === '/list/feeder')).toBe(true)
  })

  it('puts Sale barns in the footer for everyone', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderApp()
    const links = screen.getAllByRole('link', { name: 'Sale barns' })
    expect(links.some((a) => a.getAttribute('href') === '/barns')).toBe(true)
    expect(screen.queryByRole('button', { name: /staff tools/i })).toBeNull()
  })
})
