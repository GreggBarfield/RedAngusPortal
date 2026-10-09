import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { getUnsubscribe, postUnsubscribe } from '@/lib/api'

// The page behind the unsubscribe link in every showlist email. Opening it changes nothing;
// the button does (mail scanners open links, so a link alone must never unsubscribe anyone).
export default function Unsubscribe() {
  const { token = '' } = useParams()
  const [name, setName] = useState('')
  const [state, setState] = useState<'loading' | 'ready' | 'already' | 'done' | 'missing' | 'error'>('loading')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    getUnsubscribe(token)
      .then((r) => {
        if (cancelled) return
        setName(r.feedlotName)
        setState(r.alreadyOff ? 'already' : 'ready')
      })
      .catch((err: { status?: number }) => {
        if (!cancelled) setState(err.status === 404 ? 'missing' : 'error')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  async function go() {
    setBusy(true)
    try {
      const r = await postUnsubscribe(token)
      setName(r.feedlotName)
      setState('done')
    } catch {
      setState('error')
    }
    setBusy(false)
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Stop these emails</h1>
      {state === 'loading' && <p className="mt-3 text-muted-foreground">Loading...</p>}
      {state === 'ready' && (
        <>
          <p className="mt-3">
            Stop emailing <strong>{name}</strong> lists of cattle for sale from the Red Angus Association Marketing Portal?
          </p>
          <Button className="mt-4" onClick={go} disabled={busy}>
            {busy ? 'Working...' : 'Yes, unsubscribe'}
          </Button>
        </>
      )}
      {state === 'already' && <p className="mt-3">{name} is already unsubscribed. No more emails will be sent.</p>}
      {state === 'done' && <p className="mt-3">Done. {name} will not be emailed again.</p>}
      {state === 'missing' && <p className="mt-3">This link is not valid. If you still get emails you do not want, reply to one and ask to be removed.</p>}
      {state === 'error' && (
        <p role="alert" className="mt-3 text-destructive">
          Something went wrong. Please try again in a few minutes.
        </p>
      )}
    </main>
  )
}
