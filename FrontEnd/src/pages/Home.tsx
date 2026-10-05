import { Link } from 'react-router-dom'
import { ListPlus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Page } from '@/components/Page'

export default function Home() {
  return (
    <Page className="max-w-4xl py-16">
      <p className="text-sm font-medium text-primary">Red Angus Association</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Red Angus Marketing Portal</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        Search and list Red Angus cattle. Breeding bulls and females, feeder cattle, semen and embryos, all in one place.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link to="/search/feeder">
            <Search className="size-4" /> Search for cattle
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link to="/list/feeder">
            <ListPlus className="size-4" /> List your cattle
          </Link>
        </Button>
      </div>
    </Page>
  )
}
