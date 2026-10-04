import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/FormField'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'

export default function Register() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [membershipNumber, setMembershipNumber] = useState('')
  const [password, setPassword] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/account" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setFields({})
    setBusy(true)
    try {
      await register({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        membershipNumber: membershipNumber.trim(),
      })
      navigate('/account', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && (err.status === 400 || err.status === 409)) {
        setFields(err.fields)
        if (Object.keys(err.fields).length === 0) setError('Check the form and try again.')
      } else if (err instanceof ApiError && err.status === 429) {
        setError('Too many sign-ups from this connection. Try again later.')
      } else {
        setError('Could not reach the server. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Create account</CardTitle>
          <CardDescription>For Red Angus Association members and approved sale barns.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4" noValidate>
            <FormField
              id="displayName"
              label="Name or ranch"
              value={displayName}
              onChange={setDisplayName}
              error={fields.displayName}
              autoComplete="name"
            />
            <FormField
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              error={fields.email}
              autoComplete="email"
            />
            <FormField
              id="membershipNumber"
              label="Membership number"
              value={membershipNumber}
              onChange={setMembershipNumber}
              error={fields.membershipNumber}
              hint="Your Red Angus Association membership number."
            />
            <FormField
              id="password"
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              error={fields.password}
              hint="At least 10 characters."
              autoComplete="new-password"
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? 'Creating...' : 'Create account'}
            </Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            Already registered?{' '}
            <Link to="/login" className="text-primary underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
