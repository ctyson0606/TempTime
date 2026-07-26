import { beforeEach, describe, expect, it } from 'vitest'
import type { BusyBlock } from '../lib/providers/types'
import { clearImport, loadImport, saveImport } from '../lib/importCache'

/** Enough of the Storage interface for this module, without a DOM. */
function installSessionStorage(): Map<string, string> {
  const entries = new Map<string, string>()
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => void entries.set(key, value),
      removeItem: (key: string) => void entries.delete(key),
    },
  })
  return entries
}

const blocks: BusyBlock[] = [
  {
    id: 'ics:a@test:1',
    start: new Date('2026-07-26T06:00:00Z'),
    end: new Date('2026-07-26T08:00:00Z'),
    label: 'Team sync',
    source: 'ics',
  },
  {
    id: 'ics:b@test:2',
    start: new Date('2026-07-27T01:00:00Z'),
    end: new Date('2026-07-27T01:30:00Z'),
    source: 'ics',
  },
]

const CODE = 'X7B92M'
let entries: Map<string, string>

beforeEach(() => {
  entries = installSessionStorage()
})

describe('the import cache', () => {
  it('is empty until something is saved', () => {
    expect(loadImport(CODE)).toBeNull()
  })

  it('round-trips blocks with their dates intact', () => {
    saveImport(CODE, { blocks, selected: [blocks[0].id] })
    const loaded = loadImport(CODE)

    expect(loaded?.blocks).toEqual(blocks)
    expect(loaded?.blocks[0].start).toBeInstanceOf(Date)
    expect(loaded?.selected).toEqual([blocks[0].id])
  })

  it('keeps each room separate', () => {
    saveImport(CODE, { blocks, selected: [] })
    expect(loadImport('OTHER1')).toBeNull()
  })

  it('drops a selection naming blocks that are gone', () => {
    saveImport(CODE, { blocks, selected: [blocks[0].id, 'ics:vanished:9'] })
    expect(loadImport(CODE)?.selected).toEqual([blocks[0].id])
  })

  it('reads a corrupted entry as nothing cached', () => {
    entries.set(`temptime:import:${CODE}`, '{ half written')
    expect(loadImport(CODE)).toBeNull()
  })

  it('reads an entry with an unusable date as nothing cached', () => {
    entries.set(
      `temptime:import:${CODE}`,
      JSON.stringify({
        blocks: [{ id: 'a', start: 'yesterday', end: 'tomorrow', source: 'ics' }],
        selected: ['a'],
      }),
    )
    expect(loadImport(CODE)).toBeNull()
  })

  it('reads an entry from another shape as nothing cached', () => {
    entries.set(`temptime:import:${CODE}`, JSON.stringify({ events: [] }))
    expect(loadImport(CODE)).toBeNull()
  })

  it('clears', () => {
    saveImport(CODE, { blocks, selected: [] })
    clearImport(CODE)
    expect(loadImport(CODE)).toBeNull()
    expect(entries.size).toBe(0)
  })

  it('survives a storage that refuses to write', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('denied')
        },
        setItem: () => {
          throw new Error('quota')
        },
        removeItem: () => {
          throw new Error('denied')
        },
      },
    })

    expect(() => saveImport(CODE, { blocks, selected: [] })).not.toThrow()
    expect(loadImport(CODE)).toBeNull()
    expect(() => clearImport(CODE)).not.toThrow()
  })
})
