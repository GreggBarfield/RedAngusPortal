import { ApiError, uploadAttachment, uploadPhoto } from '@/lib/api'
import type { CattleKind, DocType } from '@/lib/api'

// Same limits the server enforces (it checks again).
export const MAX_PHOTOS = 10
export const MAX_DOCS = 5
export const MAX_BYTES = 10 * 1024 * 1024

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  health_records: 'Health records',
  pedigree: 'Pedigree / registration',
  epd_report: 'EPD report',
  sale_sheet: 'Sale sheet',
  other: 'Other',
}
export const DOC_TYPES = Object.keys(DOC_TYPE_LABELS) as DocType[]

export const isPhotoFile = (f: File) => /\.(jpe?g|png)$/i.test(f.name) || f.type === 'image/jpeg' || f.type === 'image/png'
export const isDocFile = (f: File) => /\.(pdf|docx?|xlsx?|jpe?g|png)$/i.test(f.name)

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export interface QueuedPhoto {
  key: number
  file: File
}
export interface QueuedDoc {
  key: number
  file: File
  docType: DocType
}
// Files picked on the form that are sent once the listing itself has been saved.
export interface MediaDraft {
  photos: QueuedPhoto[]
  docs: QueuedDoc[]
}
export const emptyDraft = (): MediaDraft => ({ photos: [], docs: [] })

// Sends the picked files one at a time. Returns a message for each file that did not go through.
export async function uploadDraft(kind: CattleKind, id: string, draft: MediaDraft, token: string): Promise<string[]> {
  const problems: string[] = []
  const why = (err: unknown) => (err instanceof ApiError && err.fields.file ? err.fields.file : 'It could not be sent. Try again.')
  for (const p of draft.photos) {
    try {
      await uploadPhoto(kind, id, p.file, token)
    } catch (err) {
      problems.push(`${p.file.name}: ${why(err)}`)
    }
  }
  for (const d of draft.docs) {
    try {
      await uploadAttachment(kind, id, d.file, d.docType, token)
    } catch (err) {
      problems.push(`${d.file.name}: ${why(err)}`)
    }
  }
  return problems
}
