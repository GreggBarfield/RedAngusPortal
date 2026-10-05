import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, deleteFilter, getSavedFilters, saveFilter } from '@/lib/api'
import type { CattleKind, SavedFilter } from '@/lib/api'
import { fromSaved, toSaved } from '@/lib/searchFilters'

// "Saved Filters": apply, delete, or save the search on screen under a name. Needs a signed-in person.
export default function SavedFilters({
  kind,
  token,
  params,
  canSave,
  onApply,
}: {
  kind: CattleKind
  token: string | null
  params: URLSearchParams
  canSave: boolean
  onApply: (next: URLSearchParams) => void
}) {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<SavedFilter[] | null>(null)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState('')

  const load = useCallback(async () => {
    if (!token) return
    try {
      setList((await getSavedFilters(kind, token)).filters)
      setProblem('')
    } catch {
      setProblem('Could not load your saved searches.')
    }
  }, [kind, token])

  useEffect(() => {
    setList(null)
    setNote('')
    if (open) void load()
  }, [open, load])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!token) return
    setNote('')
    setProblem('')
    if (!name.trim()) return setProblem('Give the search a name.')
    try {
      const r = await saveFilter(kind, name.trim(), toSaved(kind, params), token)
      setNote(`Saved as "${r.filter.name}".`)
      setName('')
      await load()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'limit') setProblem('You have 25 saved searches. Delete one first.')
      else if (err instanceof ApiError && err.fields) setProblem(Object.values(err.fields)[0] ?? 'Could not save this search.')
      else setProblem('Could not save this search. Try again.')
    }
  }

  async function remove(f: SavedFilter) {
    if (!token) return
    try {
      await deleteFilter(f.id, token)
      setNote(`Deleted "${f.name}".`)
      await load()
    } catch {
      setProblem('Could not delete that search.')
    }
  }

  return (
    <div className="relative">
      <Button type="button" variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>
        Saved Filters
      </Button>
      {open && (
        <div role="group" aria-label="Saved filters" className="absolute right-0 z-20 mt-2 w-[min(26rem,calc(100vw-2rem))] rounded-lg border bg-card p-4 shadow-lg">
          {!token ? (
            <p className="text-sm">
              <Link to="/login" className="text-primary underline">
                Sign in
              </Link>{' '}
              to save a search and come back to it.
            </p>
          ) : (
            <div className="grid gap-4">
              <div>
                <h3 className="text-sm font-semibold">Your saved searches</h3>
                {list == null && !problem && <p className="mt-1 text-sm text-muted-foreground">Loading...</p>}
                {list && list.length === 0 && <p className="mt-1 text-sm text-muted-foreground">Nothing saved yet.</p>}
                <ul className="mt-2 grid gap-1">
                  {list?.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        className="truncate text-left text-sm text-primary underline"
                        onClick={() => {
                          onApply(fromSaved(kind, f.params))
                          setOpen(false)
                        }}
                      >
                        {f.name}
                      </button>
                      <Button type="button" size="sm" variant="ghost" aria-label={`Delete ${f.name}`} onClick={() => void remove(f)}>
                        Delete
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
              <form onSubmit={save} className="grid gap-2 border-t pt-3">
                <Label htmlFor="save-name">Save this search as</Label>
                <div className="flex gap-2">
                  <Input id="save-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} disabled={!canSave} />
                  <Button type="submit" disabled={!canSave}>
                    Save
                  </Button>
                </div>
                {!canSave && <p className="text-xs text-muted-foreground">Choose a filter or type a search first.</p>}
              </form>
              {note && <p className="text-sm text-muted-foreground">{note}</p>}
              {problem && (
                <p role="alert" className="text-sm text-destructive">
                  {problem}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
