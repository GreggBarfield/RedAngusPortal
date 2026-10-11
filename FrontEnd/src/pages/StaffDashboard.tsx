import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Page } from '@/components/Page'
import { CHART_COLORS, ChartCard, DataTable, HBars, Legend, StackedColumns } from '@/components/charts'
import type { Series } from '@/components/charts'
import { getDashboard } from '@/lib/dashboard'
import type { DashboardData, Reach } from '@/lib/dashboard'
import { useAuth } from '@/lib/auth'

const nf = (n: number) => n.toLocaleString('en-US')

function Tile({ label, value, sub, to }: { label: string; value: ReactNode; sub?: ReactNode; to?: string }) {
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </>
  )
  const cls = 'rounded-lg border bg-card p-4'
  return to ? (
    <Link to={to} className={cls + ' block hover:bg-accent/40'}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

const WEEK_SERIES: Series[] = [
  { key: 'feeder', name: 'Feeder', color: CHART_COLORS.blue },
  { key: 'breeding', name: 'Breeding', color: CHART_COLORS.orange },
]
const REACH_SERIES: Series[] = [
  { key: 'email', name: 'Has an email', color: CHART_COLORS.blue },
  { key: 'faxOnly', name: 'Fax only', color: CHART_COLORS.orange },
  { key: 'neither', name: 'No email or fax', color: CHART_COLORS.gray },
]

function weekLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function reachRow(label: string, r: Reach) {
  return {
    label,
    segments: REACH_SERIES.map((s) => ({ key: s.key, name: s.name, color: s.color, value: r[s.key as keyof Reach] })),
  }
}

export default function StaffDashboard() {
  const { user, token, loading } = useAuth()
  const isStaff = user?.role === 'staff' && Boolean(token)
  const [d, setD] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    if (!token) return
    setError('')
    getDashboard(token)
      .then((r) => setD(r.dashboard))
      .catch(() => setError('Could not load the dashboard. Try again.'))
  }, [token])

  useEffect(() => {
    if (isStaff) load()
  }, [isStaff, load])

  if (loading) return <Page><p className="text-sm text-muted-foreground">Loading...</p></Page>

  if (!isStaff) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Staff only</h1>
      </main>
    )
  }

  const live = d ? d.listings.feederLive + d.listings.breedingLive : 0
  const o = d?.listings.outcomes

  return (
    <Page>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {d ? `Updated ${new Date(d.generatedAt).toLocaleString()}` : 'Loading...'}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={load}>
          Refresh
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-6 text-sm text-destructive">
          {error}
        </p>
      )}

      {d && o && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Live feeder listings" value={nf(d.listings.feederLive)} sub={`${nf(d.listings.feederHead)} head`} to="/search/feeder" />
            <Tile label="Live breeding listings" value={nf(d.listings.breedingLive)} sub={`${nf(d.listings.breedingHead)} head`} to="/search/breeding" />
            <Tile
              label="Waiting for approval"
              value={nf(d.listings.pending)}
              sub={d.attention.pendingOverTwoDays > 0 ? `${nf(d.attention.pendingOverTwoDays)} waiting over 2 days` : 'None waiting over 2 days'}
              to="/staff/review"
            />
            <Tile label="Members" value={nf(d.people.members)} sub={`${nf(d.people.newThisWeek)} new this week - ${nf(d.people.sellers)} with a live listing`} />
            <Tile
              label="Sale barns"
              value={d.barns ? nf(d.barns.total) : 'n/a'}
              sub={d.barns ? `${nf(d.barns.active)} active - ${nf(d.barns.withEmail)} with an email` : 'BlockTrust barn list not reachable'}
              to="/barns"
            />
            <Tile
              label="Feedlots"
              value={nf(d.feedlots.total)}
              sub={`${nf(d.feedlots.canEmail)} can be emailed - ${nf(d.feedlots.doNotEmail)} do not email`}
              to="/feedlots"
            />
            <Tile
              label="Showlists sent"
              value={nf(d.showlists.sent)}
              sub={
                d.showlists.sent > 0
                  ? `${nf(d.showlists.emailsSent)} emails - ${nf(d.showlists.delivered)} delivered - ${nf(d.showlists.failed)} failed`
                  : 'Nothing sent yet'
              }
              to="/staff/showlists"
            />
            <Tile label="Datasheets sent to barns" value={0} sub="Sending to barns is not built yet" />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <ChartCard title="New listings per week" note="Last 12 weeks, feeder and breeding.">
              <Legend series={WEEK_SERIES} />
              <StackedColumns
                series={WEEK_SERIES}
                ariaLabel="New listings per week for the last 12 weeks"
                groups={d.weekly.map((w) => ({
                  label: weekLabel(w.week),
                  values: [
                    { key: 'feeder', value: w.feeder },
                    { key: 'breeding', value: w.breeding },
                  ],
                }))}
              />
              <DataTable
                label="Show as a table"
                head={['Week of', 'Feeder', 'Breeding']}
                rows={d.weekly.map((w) => [weekLabel(w.week), w.feeder, w.breeding])}
              />
            </ChartCard>

            <ChartCard title="Live listings by state" note="Top 10 states, approved listings only.">
              <Legend series={WEEK_SERIES} />
              <HBars
                empty="No live listings yet."
                rows={d.states.map((s) => ({
                  label: s.state,
                  segments: [
                    { key: 'feeder', name: 'Feeder', color: CHART_COLORS.blue, value: s.feeder },
                    { key: 'breeding', name: 'Breeding', color: CHART_COLORS.orange, value: s.breeding },
                  ],
                }))}
              />
              <DataTable label="Show as a table" head={['State', 'Feeder', 'Breeding']} rows={d.states.map((s) => [s.state, s.feeder, s.breeding])} />
            </ChartCard>

            <ChartCard title="Feeder cattle on offer" note="Head count in live feeder listings.">
              <HBars
                empty="No live feeder listings yet."
                rows={[
                  { label: 'Steers', segments: [{ key: 'n', name: 'Head', color: CHART_COLORS.blue, value: d.sex.steers }] },
                  { label: 'Heifers', segments: [{ key: 'n', name: 'Head', color: CHART_COLORS.blue, value: d.sex.heifers }] },
                ]}
              />
            </ChartCard>

            <ChartCard title="Listing outcomes" note="Every listing ever entered, by where it stands.">
              <HBars
                empty="No listings yet."
                rows={[
                  ['Live', o.approved],
                  ['Waiting', o.pending],
                  ['Sold', o.sold],
                  ['Rejected', o.rejected],
                  ['Withdrawn', o.withdrawn],
                ].map(([label, value]) => ({
                  label: label as string,
                  segments: [{ key: 'n', name: 'Listings', color: CHART_COLORS.blue, value: value as number }],
                }))}
              />
            </ChartCard>

            <ChartCard title="Who we can reach" note="Active sale barns and feedlots, by the best contact we have.">
              <Legend series={REACH_SERIES} />
              <HBars
                empty="No contacts yet."
                rows={[...(d.barns ? [reachRow('Sale barns', d.barns.reach)] : []), reachRow('Feedlots', d.feedlots.reach)]}
              />
              {!d.barns && <p className="mt-2 text-xs text-muted-foreground">Sale barn numbers are not available right now.</p>}
              <DataTable
                label="Show as a table"
                head={['', 'Has an email', 'Fax only', 'No email or fax']}
                rows={[
                  ...(d.barns ? [['Sale barns', d.barns.reach.email, d.barns.reach.faxOnly, d.barns.reach.neither]] : []),
                  ['Feedlots', d.feedlots.reach.email, d.feedlots.reach.faxOnly, d.feedlots.reach.neither],
                ]}
              />
            </ChartCard>

            <section className="rounded-lg border bg-card p-4 sm:p-5">
              <h2 className="text-base font-semibold">Needs a look</h2>
              <ul className="mt-3 grid gap-2 text-sm">
                <li className="flex justify-between gap-3">
                  <Link to="/staff/review" className="text-primary hover:underline">
                    Waiting for approval more than 2 days
                  </Link>
                  <span className="font-semibold tabular-nums">{nf(d.attention.pendingOverTwoDays)}</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span>Live listings with no photo</span>
                  <span className="font-semibold tabular-nums">{nf(d.attention.noPhotos)}</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span>Live listings past their sale date</span>
                  <span className="font-semibold tabular-nums">{nf(d.attention.pastSaleDate)}</span>
                </li>
                <li className="flex justify-between gap-3 text-muted-foreground">
                  <span>Live feeder listings showing Listing Notes</span>
                  <span className="font-semibold tabular-nums">
                    {nf(d.attention.notesOn)} of {nf(d.listings.feederLive)}
                  </span>
                </li>
              </ul>
              {live === 0 && <p className="mt-3 text-xs text-muted-foreground">No live listings yet.</p>}
            </section>
          </div>
        </>
      )}
    </Page>
  )
}
