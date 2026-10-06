import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import MarketInsightsButton from '@/components/MarketInsights'

const bundle = {
  markets: [
    { slug_id: 'a', market_name: 'Bryan Livestock', distance_miles: 12 },
    { slug_id: 'b', market_name: 'Giddings Auction', distance_miles: 55 },
  ],
  region: { markets_found: 2, nearest_market: 'Bryan Livestock', nearest_market_distance_miles: 12, total_head: 1500, avg_steer_price_cwt: 2.5, avg_heifer_price_cwt: 2.25 },
  selected_market: {
    slug_id: 'a',
    market_name: 'Bryan Livestock',
    distance_miles: 12,
    city: 'Bryan',
    state: 'TX',
    report_date: '2026-10-01',
    ai_summary: 'Steers were steady.\nHeifers were higher.',
    steers: [{ weight_group: '500-600', avg_price_cwt: 2.6, low_price_cwt: 2.4, high_price_cwt: 2.8, total_head: 300 }],
    heifers: [],
  },
}

function mockFetch(body: unknown, status = 200) {
  const f = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', f)
  return f
}

afterEach(() => vi.unstubAllGlobals())

describe('Market Insights button', () => {
  it('opens the window and asks for the 200 mile area of the zip', async () => {
    const f = mockFetch({ ok: true, data: bundle })
    render(<MarketInsightsButton zip="77840" />)
    fireEvent.click(screen.getByRole('button', { name: /market insights/i }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await screen.findByText('Steers were steady.')
    expect(String(f.mock.calls[0][0])).toBe('/api/market-insights?zip=77840&radius=200')
    expect(screen.getByText('Heifers were higher.')).toBeInTheDocument()
    expect(screen.getByText('500-600')).toBeInTheDocument()
    expect(screen.getByText('$2.50/cwt')).toBeInTheDocument()
  })

  it('loads another market when picked, and closes with Escape', async () => {
    const f = mockFetch({ ok: true, data: bundle })
    render(<MarketInsightsButton zip="77840" />)
    fireEvent.click(screen.getByRole('button', { name: /market insights/i }))
    const pick = await screen.findByLabelText('Market')
    fireEvent.change(pick, { target: { value: 'b' } })
    await waitFor(() => expect(f.mock.calls.some((c) => String(c[0]).endsWith('&slug_id=b'))).toBe(true))
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('asks for a zip when there is none, then looks it up', async () => {
    const f = mockFetch({ ok: true, data: bundle })
    render(<MarketInsightsButton zip="" />)
    fireEvent.click(screen.getByRole('button', { name: /market insights/i }))
    await screen.findByText(/enter your zip code/i)
    expect(f).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Zip code'), { target: { value: '77840' } })
    fireEvent.click(screen.getByRole('button', { name: /show markets/i }))
    await screen.findByText('Steers were steady.')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('shows the service message when there is no data', async () => {
    mockFetch({ ok: false, error: 'No markets found within 200 miles.' })
    render(<MarketInsightsButton zip="99999" />)
    fireEvent.click(screen.getByRole('button', { name: /market insights/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No markets found within 200 miles.')
  })

  it('shows a plain message when the service is down', async () => {
    mockFetch({ ok: false, error: 'Market insights are not available right now.' }, 502)
    render(<MarketInsightsButton zip="77840" />)
    fireEvent.click(screen.getByRole('button', { name: /market insights/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('not available right now')
  })
})
