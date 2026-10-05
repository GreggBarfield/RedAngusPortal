import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Field, Section, Span } from '@/components/form'
import { ApiError, deleteAttachment, deletePhoto, downloadAttachment, setCoverPhoto } from '@/lib/api'
import type { CattleKind, DocType, ListingAttachment, ListingPhoto } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { DOC_TYPES, DOC_TYPE_LABELS, MAX_BYTES, MAX_DOCS, MAX_PHOTOS, formatSize, isDocFile, isPhotoFile } from '@/lib/media'
import type { MediaDraft } from '@/lib/media'
import { cn } from '@/lib/utils'

let queueKey = 1

// ---------------------------------------------------------------------------
// Showing photos and documents to buyers
// ---------------------------------------------------------------------------

// One big photo (the cover first) with the others as small pictures underneath.
export function PhotoGallery({ photos }: { photos?: ListingPhoto[] }) {
  const list = photos ?? []
  const [i, setI] = useState(0)
  if (list.length === 0) return null
  const at = Math.min(i, list.length - 1)
  const cur = list[at]
  return (
    <div className="grid gap-2">
      <a href={cur.fullUrl} target="_blank" rel="noreferrer" aria-label="Open the full-size photo" className="block overflow-hidden rounded-md border bg-muted">
        <img src={cur.mediumUrl} alt={`Photo ${at + 1} of ${list.length}`} className="mx-auto max-h-[28rem] w-full object-contain" />
      </a>
      {list.length > 1 && (
        <div role="group" aria-label="Photos" className="flex flex-wrap gap-2">
          {list.map((p, n) => (
            <button
              key={p.id}
              type="button"
              aria-label={`Show photo ${n + 1}`}
              aria-pressed={n === at}
              onClick={() => setI(n)}
              className={cn('overflow-hidden rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', n === at && 'ring-2 ring-primary')}
            >
              <img src={p.thumbUrl} alt="" className="h-14 w-20 object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// A row of small pictures that open full size (staff review, lists).
export function PhotoStrip({ photos }: { photos?: ListingPhoto[] }) {
  const list = photos ?? []
  if (list.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {list.map((p, n) => (
        <a key={p.id} href={p.fullUrl} target="_blank" rel="noreferrer" aria-label={`Open photo ${n + 1} full size`} className="overflow-hidden rounded-md border">
          <img src={p.thumbUrl} alt="" className="h-16 w-24 object-cover" />
        </a>
      ))}
    </div>
  )
}

// The little picture on a search card or My listings row.
export function CoverThumb({ photos }: { photos?: ListingPhoto[] }) {
  const cover = (photos ?? [])[0]
  if (!cover) return null
  return <img src={cover.thumbUrl} alt="" loading="lazy" className="h-20 w-28 shrink-0 rounded-md border object-cover" />
}

export function hasDocuments(l: { attachments?: ListingAttachment[]; attachmentCount?: number }, signedIn: boolean): boolean {
  return signedIn ? (l.attachments?.length ?? 0) > 0 : (l.attachmentCount ?? 0) > 0
}

// Documents on a listing: signed-in users can download them; visitors are asked to sign in.
export function DocumentList({ kind, listing }: { kind: CattleKind; listing: { id: string; attachments?: ListingAttachment[]; attachmentCount?: number } }) {
  const { user, token } = useAuth()
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  if (!hasDocuments(listing, !!user)) return null
  if (!user || !token) {
    const n = listing.attachmentCount ?? 0
    return (
      <p className="text-sm">
        {n} {n === 1 ? 'document is' : 'documents are'} attached.{' '}
        <Link to="/login" className="text-primary underline">
          Sign in
        </Link>{' '}
        to view {n === 1 ? 'it' : 'them'}.
      </p>
    )
  }

  async function get(att: ListingAttachment) {
    if (!token) return
    setBusyId(att.id)
    setError('')
    try {
      await downloadAttachment(kind, listing.id, att, token)
    } catch {
      setError('Could not download that file. Try again.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="grid gap-2">
      <ul className="grid gap-2">
        {(listing.attachments ?? []).map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              <span className="font-medium">{a.name}</span>{' '}
              <span className="text-muted-foreground">
                ({DOC_TYPE_LABELS[a.docType] ?? 'Other'}, {formatSize(a.size)})
              </span>
            </span>
            <Button type="button" size="sm" variant="outline" disabled={busyId === a.id} aria-label={`Download ${a.name}`} onClick={() => void get(a)}>
              Download
            </Button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The "Photos and Documents" part of the listing forms
// ---------------------------------------------------------------------------

// A picked photo, shown before it is sent.
function QueuedThumb({ file }: { file: File }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    if (typeof URL.createObjectURL !== 'function') return
    const u = URL.createObjectURL(file)
    setSrc(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return src ? <img src={src} alt="" className="h-24 w-full object-cover" /> : <div className="h-24 w-full bg-muted" />
}

interface MediaProps {
  kind: CattleKind
  listingId: string | null
  token: string | null
  photos: ListingPhoto[]
  docs: ListingAttachment[]
  onExisting: (photos: ListingPhoto[], docs: ListingAttachment[]) => void
  draft: MediaDraft
  onDraft: (d: MediaDraft) => void
}

export function MediaSection({ kind, listingId, token, photos, docs, onExisting, draft, onDraft }: MediaProps) {
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const editing = listingId != null

  const photoCount = photos.length + draft.photos.length
  const docCount = docs.length + draft.docs.length

  function pickPhotos(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
    setNotice('')
    const problems: string[] = []
    const ok: File[] = []
    for (const f of picked) {
      if (!isPhotoFile(f)) problems.push(`${f.name} is not a JPG or PNG photo.`)
      else if (f.size > MAX_BYTES) problems.push(`${f.name} is bigger than 10 MB.`)
      else if (f.size === 0) problems.push(`${f.name} is empty.`)
      else ok.push(f)
    }
    const room = Math.max(0, MAX_PHOTOS - photoCount)
    if (ok.length > room) problems.push(`You can add up to ${MAX_PHOTOS} photos. ${room === 0 ? 'Remove one to add another.' : `Only the first ${room} were added.`}`)
    const take = ok.slice(0, room)
    setMessage(problems.join(' '))
    if (take.length) onDraft({ ...draft, photos: [...draft.photos, ...take.map((file) => ({ key: queueKey++, file }))] })
  }

  function pickDocs(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
    setNotice('')
    const problems: string[] = []
    const ok: File[] = []
    for (const f of picked) {
      if (!isDocFile(f)) problems.push(`${f.name} is not a PDF, Word, Excel, JPG or PNG file.`)
      else if (f.size > MAX_BYTES) problems.push(`${f.name} is bigger than 10 MB.`)
      else if (f.size === 0) problems.push(`${f.name} is empty.`)
      else ok.push(f)
    }
    const room = Math.max(0, MAX_DOCS - docCount)
    if (ok.length > room) problems.push(`You can attach up to ${MAX_DOCS} files. ${room === 0 ? 'Remove one to add another.' : `Only the first ${room} were added.`}`)
    const take = ok.slice(0, room)
    setMessage(problems.join(' '))
    if (take.length) onDraft({ ...draft, docs: [...draft.docs, ...take.map((file) => ({ key: queueKey++, file, docType: 'other' as DocType }))] })
  }

  // Removing or choosing a cover on a listing that is already saved happens right away.
  async function act(work: () => Promise<void>, done: string) {
    if (!token) return
    setBusy(true)
    setMessage('')
    setNotice('')
    try {
      await work()
      setNotice(done)
    } catch (err) {
      setMessage(err instanceof ApiError && err.status === 409 ? 'This listing is closed and cannot be changed.' : 'That did not work. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const removePhoto = (p: ListingPhoto) =>
    act(async () => {
      await deletePhoto(kind, listingId ?? '', p.id, token ?? '')
      const left = photos.filter((x) => x.id !== p.id)
      if (p.isCover && left[0]) left[0] = { ...left[0], isCover: true }
      onExisting(left, docs)
    }, 'Photo removed.')

  const makeCover = (p: ListingPhoto) =>
    act(async () => {
      await setCoverPhoto(kind, listingId ?? '', p.id, token ?? '')
      const next = photos.map((x) => ({ ...x, isCover: x.id === p.id }))
      next.sort((a, b) => Number(b.isCover) - Number(a.isCover))
      onExisting(next, docs)
    }, 'Cover photo changed.')

  const removeDoc = (a: ListingAttachment) =>
    act(async () => {
      await deleteAttachment(kind, listingId ?? '', a.id, token ?? '')
      onExisting(photos, docs.filter((x) => x.id !== a.id))
    }, 'Document removed.')

  return (
    <Section title="Photos and Documents" hint="Photos help cattle sell. Documents (health records, pedigrees, EPD sheets) can be seen by signed-in buyers.">
      <Span>
        <div className="grid gap-5">
          {editing && (
            <p className="text-sm text-muted-foreground">Adding or removing a photo or document on a live listing sends it back to our staff for approval. Removing a file happens right away.</p>
          )}
          {message && (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm">
              {notice}
            </p>
          )}

          <div className="grid gap-3">
            <Field id="photoFiles" label={`Photos (${photoCount} of ${MAX_PHOTOS})`} hint="JPG or PNG, up to 10 MB each. The cover photo (the first one) shows in the search results.">
              <Input id="photoFiles" type="file" accept="image/jpeg,image/png" multiple disabled={busy || photoCount >= MAX_PHOTOS} onChange={pickPhotos} />
            </Field>
            {(photos.length > 0 || draft.photos.length > 0) && (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Photos on this listing">
                {photos.map((p, n) => (
                  <li key={p.id} className="grid gap-1 overflow-hidden rounded-md border bg-card text-sm">
                    <img src={p.thumbUrl} alt={`Photo ${n + 1}`} className="h-24 w-full object-cover" />
                    <div className="flex flex-wrap items-center gap-1 px-2 pb-2">
                      {p.isCover ? (
                        <Badge variant="secondary">Cover</Badge>
                      ) : (
                        <Button type="button" size="sm" variant="outline" disabled={busy} aria-label={`Make photo ${n + 1} the cover`} onClick={() => void makeCover(p)}>
                          Make cover
                        </Button>
                      )}
                      <Button type="button" size="sm" variant="outline" disabled={busy} aria-label={`Remove photo ${n + 1}`} onClick={() => void removePhoto(p)}>
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
                {draft.photos.map((q) => (
                  <li key={q.key} className="grid gap-1 overflow-hidden rounded-md border border-dashed bg-card text-sm">
                    <QueuedThumb file={q.file} />
                    <p className="truncate px-2 text-xs text-muted-foreground" title={q.file.name}>
                      {q.file.name} - will be added when you save
                    </p>
                    <div className="px-2 pb-2">
                      <Button type="button" size="sm" variant="outline" aria-label={`Remove ${q.file.name}`} onClick={() => onDraft({ ...draft, photos: draft.photos.filter((x) => x.key !== q.key) })}>
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-3">
            <Field id="docFiles" label={`Documents (${docCount} of ${MAX_DOCS})`} hint="PDF, Word, Excel, JPG or PNG, up to 10 MB each.">
              <Input id="docFiles" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" multiple disabled={busy || docCount >= MAX_DOCS} onChange={pickDocs} />
            </Field>
            {(docs.length > 0 || draft.docs.length > 0) && (
              <ul className="grid gap-2" aria-label="Documents on this listing">
                {docs.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm">
                    <span>
                      <span className="font-medium">{a.name}</span>{' '}
                      <span className="text-muted-foreground">
                        ({DOC_TYPE_LABELS[a.docType] ?? 'Other'}, {formatSize(a.size)})
                      </span>
                    </span>
                    <Button type="button" size="sm" variant="outline" disabled={busy} aria-label={`Remove ${a.name}`} onClick={() => void removeDoc(a)}>
                      Remove
                    </Button>
                  </li>
                ))}
                {draft.docs.map((q) => (
                  <li key={q.key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed bg-card px-3 py-2 text-sm">
                    <span>
                      <span className="font-medium">{q.file.name}</span> <span className="text-muted-foreground">({formatSize(q.file.size)}) - will be added when you save</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Select
                        aria-label={`Kind of document for ${q.file.name}`}
                        className="w-52"
                        value={q.docType}
                        onChange={(e) => onDraft({ ...draft, docs: draft.docs.map((x) => (x.key === q.key ? { ...x, docType: e.target.value as DocType } : x)) })}
                      >
                        {DOC_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {DOC_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </Select>
                      <Button type="button" size="sm" variant="outline" aria-label={`Remove ${q.file.name}`} onClick={() => onDraft({ ...draft, docs: draft.docs.filter((x) => x.key !== q.key) })}>
                        Remove
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Span>
    </Section>
  )
}
