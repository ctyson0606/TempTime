import type { BusyBlock, ProviderId } from './providers/types'

/**
 * Imported events, held across a reload of the room page.
 *
 * `sessionStorage`, deliberately, and this is the only place event titles are
 * ever written down. It dies with the tab, which is the trade-off PLAN.md
 * section 2.1 accepts: the alternative to a cache is re-importing the file on
 * every reload, and the alternative to session scope is private titles sitting
 * on disk indefinitely.
 *
 * Nothing here is ever sent anywhere. What leaves the browser is the 0/1 mask,
 * built from whichever of these the member left ticked.
 */
const KEY = (code: string) => `temptime:import:${code}`

export interface CachedImport {
  blocks: BusyBlock[]
  /** Ids still counted as busy. */
  selected: string[]
}

/** The on-disk shape: `Date` does not survive `JSON.stringify` intact. */
interface StoredBlock {
  id: string
  start: string
  end: string
  label?: string
  source: ProviderId
}

export function saveImport(code: string, value: CachedImport): void {
  const stored = {
    blocks: value.blocks.map((block) => ({
      ...block,
      start: block.start.toISOString(),
      end: block.end.toISOString(),
    })),
    selected: value.selected,
  }
  try {
    sessionStorage.setItem(KEY(code), JSON.stringify(stored))
  } catch {
    // Private-mode browsers and full quotas both throw here. Losing the cache
    // costs a re-import; losing the page does not bear thinking about.
  }
}

/**
 * Read the cache back, or null when there is nothing usable.
 *
 * Anything malformed reads as absent rather than throwing: this is data from a
 * previous version of the page as much as from this one, and a stale shape must
 * not be able to break the room.
 */
export function loadImport(code: string): CachedImport | null {
  let raw: string | null
  try {
    raw = sessionStorage.getItem(KEY(code))
  } catch {
    return null
  }
  if (raw === null) return null

  try {
    const parsed = JSON.parse(raw) as Partial<{
      blocks: StoredBlock[]
      selected: string[]
    }>
    if (!Array.isArray(parsed.blocks) || !Array.isArray(parsed.selected)) return null

    const blocks: BusyBlock[] = []
    for (const block of parsed.blocks) {
      const start = new Date(block.start)
      const end = new Date(block.end)
      if (
        typeof block.id !== 'string' ||
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime())
      ) {
        return null
      }
      blocks.push({
        id: block.id,
        start,
        end,
        label: block.label,
        source: block.source,
      })
    }

    if (blocks.length === 0) return null
    const ids = new Set(blocks.map((block) => block.id))
    return {
      blocks,
      // A selection naming blocks that are no longer there would tick nothing.
      selected: parsed.selected.filter((id) => ids.has(id)),
    }
  } catch {
    return null
  }
}

export function clearImport(code: string): void {
  try {
    sessionStorage.removeItem(KEY(code))
  } catch {
    // Nothing to do: the cache is best-effort in both directions.
  }
}
