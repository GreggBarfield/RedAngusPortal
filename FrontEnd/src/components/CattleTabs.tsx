import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { CattleKind } from '@/lib/api'

// Breeding Cattle / Feeder Cattle tabs shown under both "Search For Cattle" and "List Your Cattle".
export default function CattleTabs({ area, active }: { area: 'search' | 'list'; active: CattleKind }) {
  const tabs: { kind: CattleKind; label: string }[] = [
    { kind: 'breeding', label: 'Breeding Cattle' },
    { kind: 'feeder', label: 'Feeder Cattle' },
  ]
  return (
    <nav aria-label="Kind of cattle" className="flex gap-1 border-b">
      {tabs.map((t) => (
        <Link
          key={t.kind}
          to={`/${area}/${t.kind}`}
          aria-current={t.kind === active ? 'page' : undefined}
          className={cn(
            '-mb-px rounded-t-md border border-b-0 px-5 py-2 text-sm font-medium',
            t.kind === active ? 'border-border bg-card text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
