import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { listShowlists } from '@/lib/api'
import type { ShowlistSummary } from '@/lib/api'
import { useAuth } from '@/lib/auth'

export function countsText(c: ShowlistSummary['counts']): string {
  const sent = c.SUBMITTED + c.DELIVERED + c.FAILED
  const parts = [`${sent} sent`]
  if (c.DELIVERED) parts.push(`${c.DELIVERED} delivered`)
  if (c.FAILED + c.SUBMIT_FAILED) parts.push(`${c.FAILED + c.SUBMIT_FAILED} failed`)
  if (c.QUEUED + c.SENDING) parts.push(`${c.QUEUED + c.SENDING} waiting`)
  return parts.join(' - ')
}

export default function Showlists() {
  const { user, token } = useAuth()
  const [rows, setRows] = useState<ShowlistSummary[] | null>(null)
  const [error, setError] = useState('')
  const isStaff = user?.role === 'staff' && Boolean(token)

  useEffect(() => {
    if (!isStaff || !token) return
    listShowlists(token)
      .then((r) => setRows(r.showlists))
      .catch(() => setError('Could not load the showlists. Try again.'))
  }, [isStaff, token])

  if (!isStaff) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Staff only</h1>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Showlists</h1>
          <p className="mt-2 text-muted-foreground">Lists of available cattle emailed to feedlots.</p>
        </div>
        <Button asChild>
          <Link to="/staff/showlists/new">Send a showlist</Link>
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-6 text-sm text-destructive">
          {error}
        </p>
      )}
      {!rows && !error && <p className="mt-6 text-sm text-muted-foreground">Loading...</p>}
      {rows && rows.length === 0 && <p className="mt-6 text-sm text-muted-foreground">Nothing has been sent yet.</p>}
      <div className="mt-6 grid gap-2">
        {(rows ?? []).map((s) => (
          <Card key={s.id}>
            <CardContent className="py-4">
              <Link to={`/staff/showlists/${s.id}`} className="font-medium text-primary hover:underline">
                {s.subject}
              </Link>
              <p className="text-sm text-muted-foreground">
                {new Date(s.createdAt).toLocaleString()} - by {s.createdBy} - {s.lotCount} lot{s.lotCount === 1 ? '' : 's'} - {s.recipientCount} emails
              </p>
              <p className="mt-1 text-sm">{countsText(s.counts)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  )
}
