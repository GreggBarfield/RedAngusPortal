import { Link } from 'react-router-dom'
import { ListPlus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  PageHeading,
  PageHeadingActions,
  PageHeadingBody,
  PageHeadingTitle,
} from '@/components/shadcncraft/pro-marketing/page-heading'

export default function Home() {
  return (
    <section className="bg-[#c1af93]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-12 px-4 py-10 sm:px-6 lg:py-16">
        <PageHeading>
          <img src="/red-angus-logo.svg" alt="Red Angus Association" className="h-20 w-auto sm:h-28" />
          <PageHeadingTitle>Cattle Marketing Portal</PageHeadingTitle>
          <PageHeadingBody className="text-[#1a2133]/80">
            Search and list Red Angus breeding and feeder cattle. Data points on every listing help serious cattle buyers make better purchasing decisions.
          </PageHeadingBody>
          <PageHeadingActions>
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
          </PageHeadingActions>
        </PageHeading>

        <div className="relative aspect-[4/3] overflow-clip rounded-xl bg-muted sm:aspect-[16/9]">
          <img
            src="/hero-cattle.jpg"
            alt="Red Angus cow and calf standing in a native grass pasture"
            className="size-full object-cover object-[50%_65%]"
          />
        </div>
      </div>
    </section>
  )
}

