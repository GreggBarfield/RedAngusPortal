import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import FeedlotForm from '@/components/FeedlotForm'
import { ApiError, createFeedlot } from '@/lib/api'
import type { FeedlotInput } from '@/lib/api'
import { useAuth } from '@/lib/auth'

export default function FeedlotNew() {
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)

  if (user?.role !== 'staff' || !token) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Staff only</h1>
        <p className="mt-2">
          <Link to="/feedlots" className="text-primary underline">
            Back to the feedlot list
          </Link>
        </p>
      </main>
    )
  }

  async function add(input: FeedlotInput) {
    setBusy(true)
    setProblem('')
    setFieldErrors({})
    try {
      const r = await createFeedlot(input, token as string)
      navigate(`/feedlots/${r.feedlot.id}`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setFieldErrors(err.fields)
        if (Object.keys(err.fields).length === 0) setProblem('Check the values and try again.')
      } else if (err instanceof ApiError && err.status === 409) {
        setProblem('A feedlot with that name, city and state is already in the list.')
      } else {
        setProblem('Could not add the feedlot. Nothing was saved. Try again.')
      }
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <p className="text-sm">
        <Link to="/feedlots" className="text-primary underline">
          All feedlots
        </Link>
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Add a feedlot</h1>
      <Card className="mt-6">
        <CardContent className="pt-6">
          <FeedlotForm fieldErrors={fieldErrors} busy={busy} submitLabel="Add feedlot" onSubmit={add} />
          {problem && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {problem}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
