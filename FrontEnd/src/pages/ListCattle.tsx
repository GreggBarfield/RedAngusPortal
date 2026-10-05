import { useParams } from 'react-router-dom'
import CattleTabs from '@/components/CattleTabs'
import { Page } from '@/components/Page'
import type { CattleKind } from '@/lib/api'
import BreedingForm from '@/pages/BreedingForm'
import FeederForm from '@/pages/FeederForm'

export default function ListCattle({ kind }: { kind: CattleKind }) {
  const { id } = useParams()
  const editing = Boolean(id)
  return (
    <Page>
      <h1 className="text-3xl font-semibold tracking-tight">{editing ? 'Edit your listing' : 'List Your Cattle'}</h1>
      {editing ? (
        <p className="mt-1 text-sm text-muted-foreground">After you save, our staff look at it again before it goes back online.</p>
      ) : (
        <div className="mt-4">
          <CattleTabs area="list" active={kind} />
        </div>
      )}
      <div className="mt-6">{kind === 'feeder' ? <FeederForm /> : <BreedingForm />}</div>
    </Page>
  )
}
