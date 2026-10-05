import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Full-width page body: uses the whole window up to a very wide limit.
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn('mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6', className)}>{children}</main>
}

export function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === '') return null
  return (
    <div className="grid gap-0.5 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  )
}
