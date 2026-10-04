import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, ListPlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getHealth } from '@/lib/api'

type ApiState = 'checking' | 'up' | 'down'

export default function Home() {
  const [api, setApi] = useState<ApiState>('checking')

  useEffect(() => {
    let cancelled = false
    getHealth()
      .then(() => {
        if (!cancelled) setApi('up')
      })
      .catch(() => {
        if (!cancelled) setApi('down')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <p className="text-sm font-medium text-primary">Red Angus Association</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Red Angus Marketing Portal</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        Search and list Red Angus cattle. Breeding bulls and females, feeder cattle, semen and
        embryos, all in one place.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link to="/listings">
            <Search className="size-4" /> Search cattle
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link to="/feeders">
            <Search className="size-4" /> Feeder cattle
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link to="/listings/new">
            <ListPlus className="size-4" /> List your cattle
          </Link>
        </Button>
      </div>

      <Card className="mt-12 max-w-md">
        <CardHeader>
          <CardTitle>Build status</CardTitle>
          <CardDescription>Phase 1: project setup</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <span className="text-sm">API</span>
          {api === 'checking' && <Badge variant="secondary">checking</Badge>}
          {api === 'up' && <Badge>connected</Badge>}
          {api === 'down' && <Badge variant="destructive">not reachable</Badge>}
        </CardContent>
      </Card>
    </main>
  )
}
