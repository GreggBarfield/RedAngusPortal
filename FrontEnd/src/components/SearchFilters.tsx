import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Check, ChipPicker, Field, SelectField, TextField } from '@/components/form'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { getBreeds, getEpdTraits, getPrograms } from '@/lib/api'
import type { CattleKind, EpdTrait } from '@/lib/api'
import { METHOD_LABELS, SEX_CLASS_LABELS, US_STATES } from '@/lib/cattle'
import { CHIPS, chipSummary, clearKeys, parseEpd, setKeys } from '@/lib/searchFilters'
import type { ChipDef, FilterId } from '@/lib/searchFilters'
import { cn } from '@/lib/utils'

interface Lists {
  breeds: string[]
  programs: string[]
  traits: EpdTrait[]
}

// Pick lists come live from BTN; if one cannot load, its filter says so instead of failing the whole page.
function useLists(kind: CattleKind): Lists & { failed: boolean } {
  const [lists, setLists] = useState<Lists>({ breeds: [], programs: [], traits: [] })
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    const done = (patch: Partial<Lists>) => alive && setLists((l) => ({ ...l, ...patch }))
    const fail = () => alive && setFailed(true)
    getBreeds().then((r) => done({ breeds: r.breeds })).catch(fail)
    if (kind === 'feeder') {
      Promise.all([getPrograms('PC'), getPrograms('SP')])
        .then(([a, b]) => done({ programs: [...new Set([...a.programs, ...b.programs].map((p) => p.name))] }))
        .catch(fail)
    } else {
      getEpdTraits().then((r) => done({ traits: r.traits })).catch(fail)
    }
    return () => {
      alive = false
    }
  }, [kind])
  return { ...lists, failed }
}

function Editor({ title, children, onApply, onClear, onClose, error }: { title: string; children: ReactNode; onApply: () => void; onClear: () => void; onClose: () => void; error?: string }) {
  return (
    <div role="group" aria-label={`${title} filter`} className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="grid grid-cols-1 items-start gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
        <Button type="button" size="sm" onClick={onApply}>
          Apply
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onClear}>
          Clear
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  )
}

interface EditorProps {
  kind: CattleKind
  params: URLSearchParams
  lists: Lists & { failed: boolean }
  chip: ChipDef
  onChange: (next: URLSearchParams) => void
  onClose: () => void
}

function FilterEditor({ params, lists, chip, onChange, onClose }: EditorProps) {
  const id = chip.id
  const [many, setMany] = useState<string[]>(() => params.getAll(id === 'epd' ? 'epd' : id === 'program' ? 'program' : id === 'class' ? 'class' : 'breed'))
  const [one, setOne] = useState(() => params.get(id === 'method' ? 'method' : 'state') ?? '')
  const [a, setA] = useState(() => (id === 'date' ? params.get('dateFrom') : id === 'weight' ? params.get('minWeight') : id === 'age' ? params.get('minAge') : params.get('zip')) ?? '')
  const [b, setB] = useState(() => (id === 'date' ? params.get('dateTo') : id === 'weight' ? params.get('maxWeight') : id === 'age' ? params.get('maxAge') : params.get('miles')) ?? '')
  const [rows, setRows] = useState(() => {
    const r = params.getAll('epd').map(parseEpd)
    return r.length ? r : [{ code: '', min: '', max: '' }]
  })
  const [error, setError] = useState('')

  const clear = () => {
    onChange(clearKeys(params, chip.keys))
    onClose()
  }
  const apply = (values: Record<string, string | string[] | undefined>) => {
    onChange(setKeys(params, values))
    onClose()
  }
  const num = (v: string) => (v.trim() === '' ? '' : v.trim())
  const bad = (v: string) => v !== '' && !/^\d+(\.\d+)?$/.test(v)

  const common = { title: chip.label, onClear: clear, onClose, error }

  switch (id) {
    case 'breed':
      return (
        <Editor {...common} onApply={() => apply({ breed: many })}>
          <div className="col-span-full">
            <ChipPicker id="f-breed" label="Breed" options={lists.breeds} selected={many} onChange={setMany} max={10} hint={lists.failed && !lists.breeds.length ? 'The breed list could not load.' : 'Red Angus shows first; type to find others.'} />
          </div>
        </Editor>
      )
    case 'program':
      return (
        <Editor {...common} onApply={() => apply({ program: many })}>
          <fieldset className="col-span-full">
            <legend className="mb-2 text-sm font-medium">Programs</legend>
            {lists.programs.length === 0 && <p className="text-sm text-muted-foreground">{lists.failed ? 'The program list could not load.' : 'Loading...'}</p>}
            <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
              {lists.programs.map((p, i) => (
                <Check key={p} id={`f-prog-${i}`} label={p} checked={many.includes(p)} onChange={(on) => setMany(on ? [...many, p] : many.filter((x) => x !== p))} />
              ))}
            </div>
          </fieldset>
        </Editor>
      )
    case 'class':
      return (
        <Editor {...common} onApply={() => apply({ class: many })}>
          <fieldset className="col-span-full">
            <legend className="mb-2 text-sm font-medium">Sex / Class</legend>
            <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
              {Object.entries(SEX_CLASS_LABELS).map(([k, label]) => (
                <Check key={k} id={`f-class-${k}`} label={label} checked={many.includes(k)} onChange={(on) => setMany(on ? [...many, k] : many.filter((x) => x !== k))} />
              ))}
            </div>
          </fieldset>
        </Editor>
      )
    case 'method':
      return (
        <Editor {...common} onApply={() => apply({ method: one })}>
          <SelectField id="f-method" label="Marketing method" value={one} onChange={setOne} blank="Any" options={Object.entries(METHOD_LABELS)} />
        </Editor>
      )
    case 'state':
      return (
        <Editor {...common} onApply={() => apply({ state: one })}>
          <SelectField id="f-state" label="State" value={one} onChange={setOne} blank="Any state" options={US_STATES} />
        </Editor>
      )
    case 'date':
      return (
        <Editor {...common} onApply={() => apply({ dateFrom: a, dateTo: b })}>
          <TextField id="f-from" label="From date" type="date" value={a} onChange={setA} />
          <TextField id="f-to" label="To date" type="date" value={b} onChange={setB} />
        </Editor>
      )
    case 'weight':
    case 'age': {
      const isW = id === 'weight'
      const keys = isW ? ['minWeight', 'maxWeight'] : ['minAge', 'maxAge']
      return (
        <Editor {...common} onApply={() => {
          if (bad(num(a)) || bad(num(b))) return setError('Enter numbers only.')
          if (num(a) && num(b) && Number(a) > Number(b)) return setError('The first number cannot be bigger than the second.')
          setError('')
          apply({ [keys[0]]: num(a), [keys[1]]: num(b) })
        }}>
          <TextField id="f-min" label={isW ? 'Minimum weight (lbs)' : 'Minimum age (months)'} inputMode="numeric" value={a} onChange={setA} />
          <TextField id="f-max" label={isW ? 'Maximum weight (lbs)' : 'Maximum age (months)'} inputMode="numeric" value={b} onChange={setB} />
        </Editor>
      )
    }
    case 'miles':
      return (
        <Editor {...common} onApply={() => {
          const zip = a.trim()
          const miles = b.trim()
          if (!zip && !miles) return apply({ zip: '', miles: '' })
          if (!/^\d{5}$/.test(zip)) return setError('Enter a 5-digit zip code.')
          if (!/^\d+$/.test(miles) || Number(miles) < 1 || Number(miles) > 3000) return setError('Enter miles from 1 to 3000.')
          setError('')
          apply({ zip, miles })
        }}>
          <TextField id="f-zip" label="Zip code" inputMode="numeric" maxLength={5} value={a} onChange={setA} />
          <TextField id="f-miles" label="Within (miles)" inputMode="numeric" value={b} onChange={setB} hint="Sorting by Closest works once this is set." />
        </Editor>
      )
    case 'epd':
      return (
        <Editor {...common} onApply={() => {
          const out: string[] = []
          for (const r of rows) {
            if (!r.code) continue
            if (bad(r.min.replace(/^-/, '')) || bad(r.max.replace(/^-/, ''))) return setError('Enter numbers only.')
            if (r.min === '' && r.max === '') continue
            out.push(`${r.code}:${r.min}:${r.max}`)
          }
          setError('')
          apply({ epd: out })
        }}>
          <div className="col-span-full grid gap-3">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
                <Field id={`f-epd-${i}`} label="EPD trait">
                  <Select id={`f-epd-${i}`} value={r.code} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))}>
                    <option value="">Choose a trait</option>
                    {lists.traits.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.name} ({t.code})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id={`f-epdmin-${i}`} label="At least">
                  <Input id={`f-epdmin-${i}`} inputMode="decimal" value={r.min} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)))} />
                </Field>
                <Field id={`f-epdmax-${i}`} label="At most">
                  <Input id={`f-epdmax-${i}`} inputMode="decimal" value={r.max} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, max: e.target.value } : x)))} />
                </Field>
                <Button type="button" variant="outline" size="sm" aria-label={`Remove trait row ${i + 1}`} onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ code: '', min: '', max: '' }])}>
                  Remove
                </Button>
              </div>
            ))}
            {rows.length < 8 && (
              <div>
                <Button type="button" variant="outline" size="sm" onClick={() => setRows([...rows, { code: '', min: '', max: '' }])}>
                  Add another trait
                </Button>
              </div>
            )}
            {lists.failed && !lists.traits.length && <p className="text-sm text-muted-foreground">The trait list could not load.</p>}
          </div>
        </Editor>
      )
    default:
      return null
  }
}

// The row of filter chips under the search box. Each chip opens its own small editor below the row.
export default function SearchFilters({ kind, params, onChange }: { kind: CattleKind; params: URLSearchParams; onChange: (next: URLSearchParams) => void }) {
  const lists = useLists(kind)
  const [open, setOpen] = useState<FilterId | null>(null)
  useEffect(() => setOpen(null), [kind])
  const chips = CHIPS[kind]
  const openChip = chips.find((c) => c.id === open)

  return (
    <div className="grid gap-3">
      <ul className="flex flex-wrap items-center gap-2" aria-label="Filters">
        {chips.map((c) => {
          const summary = chipSummary(c.id, params)
          const active = summary != null
          const isToggle = c.id === 'tagged'
          return (
            <li key={c.id} className={cn('inline-flex items-center overflow-hidden rounded-full border text-sm', active ? 'border-primary bg-primary/10' : 'bg-background')}>
              <button
                type="button"
                className="px-3 py-1.5 font-medium hover:bg-accent"
                aria-expanded={isToggle ? undefined : open === c.id}
                aria-pressed={isToggle ? active : undefined}
                onClick={() => {
                  if (isToggle) {
                    onChange(active ? clearKeys(params, c.keys) : setKeys(params, { tagged: '1' }))
                    return
                  }
                  setOpen(open === c.id ? null : c.id)
                }}
              >
                {c.label}
                {active && !isToggle ? `: ${summary}` : ''}
              </button>
              {active && !isToggle && (
                <button type="button" aria-label={`Remove ${c.label} filter`} className="border-l px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => onChange(clearKeys(params, c.keys))}>
                  x
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {openChip && <FilterEditor key={openChip.id} kind={kind} params={params} lists={lists} chip={openChip} onChange={onChange} onClose={() => setOpen(null)} />}
    </div>
  )
}
