import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// A titled block of the page with a divider under the heading (like BlockTrust's sections).
export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-card shadow-sm" aria-labelledby={`sec-${title.replace(/\W+/g, '-')}`}>
      <div className="border-b bg-muted/50 px-6 py-3">
        <h2 id={`sec-${title.replace(/\W+/g, '-')}`} className="text-base font-semibold tracking-tight">
          {title}
        </h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-5 p-6 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
    </section>
  )
}

// Lets one field take more columns than the usual one.
export function Span({ cols = 'full', children, className }: { cols?: 2 | 3 | 'full'; children: ReactNode; className?: string }) {
  const map = {
    2: 'sm:col-span-2',
    3: 'sm:col-span-2 xl:col-span-3',
    full: 'col-span-full',
  } as const
  return <div className={cn(map[cols], className)}>{children}</div>
}

export function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

interface BaseProps {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  hint?: string
}

export function TextField({ id, label, value, onChange, error, hint, type = 'text', ...rest }: BaseProps & { type?: string; placeholder?: string; maxLength?: number; inputMode?: 'numeric' | 'decimal' | 'tel' | 'email'; readOnly?: boolean; onBlur?: () => void }) {
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <Input id={id} type={type} value={value} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} onChange={(e) => onChange(e.target.value)} {...rest} />
    </Field>
  )
}

export function SelectField({ id, label, value, onChange, error, hint, options, blank }: BaseProps & { options: [string, string][]; blank: string }) {
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <Select id={id} value={value} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value)}>
        <option value="">{blank}</option>
        {options.map(([k, text]) => (
          <option key={k} value={k}>
            {text}
          </option>
        ))}
      </Select>
    </Field>
  )
}

export function TextArea({ id, label, value, onChange, error, hint, rows = 4 }: BaseProps & { rows?: number }) {
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <textarea
        id={id}
        rows={rows}
        value={value}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive"
      />
    </Field>
  )
}

export function Check({ id, label, checked, onChange, disabled }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="size-4" />
      <Label htmlFor={id}>{label}</Label>
    </div>
  )
}

// A group of checkboxes (special programs and the like).
export function CheckGroup({ legend, options, selected, onChange, error }: { legend: string; options: string[]; selected: string[]; onChange: (v: string[]) => void; error?: string }) {
  const base = useId()
  return (
    <fieldset className="col-span-full">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
        {options.map((o, i) => (
          <Check
            key={o}
            id={`${base}-${i}`}
            label={o}
            checked={selected.includes(o)}
            onChange={(on) => onChange(on ? [...selected, o] : selected.filter((x) => x !== o))}
          />
        ))}
      </div>
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </fieldset>
  )
}

// A drop-down you can tick several choices in (programs). The choices also show as small tags underneath.
export function MultiSelect({ id, label, options, selected, onChange, error, hint, searchable, max }: { id: string; label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void; error?: string; hint?: string; searchable?: boolean; max?: number }) {
  const [open, setOpen] = useState(false)
  const [find, setFind] = useState('')
  const shown = find.trim() ? options.filter((o) => o.toLowerCase().includes(find.trim().toLowerCase())) : options
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div ref={box} className="relative">
        <button
          id={id}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-invalid={error ? true : undefined}
          onClick={() => setOpen((o) => !o)}
          className="flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 py-1 text-left text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive"
        >
          <span className={cn('truncate', selected.length === 0 && 'text-muted-foreground')}>{selected.length === 0 ? 'Select...' : `${selected.length} selected`}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
        {open && (
          <div role="group" aria-label={`${label} choices`} className="absolute left-0 top-full z-20 mt-1 max-h-72 w-max min-w-full max-w-[min(28rem,90vw)] overflow-y-auto rounded-md border bg-card p-2 shadow-md">
            {searchable && <Input aria-label={`Search ${label}`} value={find} placeholder="Type to search..." className="mb-2" onChange={(e) => setFind(e.target.value)} />}
            {options.length === 0 && <p className="px-1 py-1 text-sm text-muted-foreground">Nothing to choose from.</p>}
            {options.length > 0 && shown.length === 0 && <p className="px-1 py-1 text-sm text-muted-foreground">No match.</p>}
            <div className="grid gap-1.5">
              {shown.map((o) => (
                <Check
                  key={o}
                  id={`${id}-opt-${options.indexOf(o)}`}
                  label={o}
                  checked={selected.includes(o)}
                  disabled={!selected.includes(o) && max != null && selected.length >= max}
                  onChange={(on) => onChange(on ? [...selected, o] : selected.filter((x) => x !== o))}
                />
              ))}
            </div>
            {max != null && selected.length >= max && <p className="mt-2 px-1 text-xs text-muted-foreground">Up to {max} can be chosen.</p>}
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={`Chosen: ${label}`}>
          {selected.map((s) => (
            <li key={s} className="inline-flex items-center gap-1 rounded-md border bg-secondary px-2 py-1 text-sm">
              {s}
              <button type="button" aria-label={`Remove ${s}`} className="text-muted-foreground hover:text-foreground" onClick={() => onChange(selected.filter((x) => x !== s))}>
                x
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

// Pick several values from a list (breeds): type to search, press Enter or choose to add.
export function ChipPicker({ id, label, options, selected, onChange, max, error, hint }: { id: string; label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void; max: number; error?: string; hint?: string }) {
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const listId = `${id}-list`

  function add(raw: string) {
    const t = raw.trim()
    if (!t) return
    const hit = options.find((o) => o.toLowerCase() === t.toLowerCase())
    if (!hit) {
      setNote('Choose a breed from the list.')
      return
    }
    if (selected.some((s) => s.toLowerCase() === hit.toLowerCase())) {
      setText('')
      return
    }
    if (selected.length >= max) {
      setNote(`Up to ${max} breeds.`)
      return
    }
    onChange([...selected, hit])
    setText('')
    setNote('')
  }

  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        list={listId}
        value={text}
        placeholder="Start typing, then choose from the list"
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          setText(e.target.value)
          setNote('')
          if (options.some((o) => o === e.target.value)) add(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add(text)
          }
        }}
        onBlur={() => text.trim() && add(text)}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={`Chosen: ${label}`}>
          {selected.map((s) => (
            <li key={s} className="inline-flex items-center gap-1 rounded-md border bg-secondary px-2 py-1 text-sm">
              {s}
              <button type="button" aria-label={`Remove ${s}`} className="text-muted-foreground hover:text-foreground" onClick={() => onChange(selected.filter((x) => x !== s))}>
                x
              </button>
            </li>
          ))}
        </ul>
      )}
      {(error || note) && (
        <p role="alert" className="text-sm text-destructive">
          {error || note}
        </p>
      )}
      {!error && !note && hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

// Runs a search a moment after the person stops typing.
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function FormBanner({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-md border border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive">
      {children}
    </p>
  )
}
