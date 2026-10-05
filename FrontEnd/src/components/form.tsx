import { useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
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

export function Check({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4" />
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
      <div className="flex gap-2">
        <Input
          id={id}
          list={listId}
          value={text}
          placeholder="Start typing..."
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
        />
        <Button type="button" variant="outline" onClick={() => add(text)}>
          Add
        </Button>
      </div>
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
