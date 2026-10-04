import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/lib/auth'

const STATUS_TEXT = {
  unverified: 'Not yet checked',
  verified: 'Verified',
  rejected: 'Rejected',
} as const

export default function Account() {
  const { user } = useAuth()
  if (!user) return null
  const rows: [string, string][] = [
    ['Name', user.displayName],
    ['Email', user.email],
    ['Membership number', user.membershipNumber],
    ['Account type', user.role],
  ]
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Your account</CardTitle>
          <CardDescription>Listing tools will appear here in a later phase.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Membership status</dt>
              <dd>
                <Badge variant={user.membershipStatus === 'rejected' ? 'destructive' : 'secondary'}>
                  {STATUS_TEXT[user.membershipStatus]}
                </Badge>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </main>
  )
}
