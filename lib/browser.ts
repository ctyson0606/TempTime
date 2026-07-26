'use client'

import { useSyncExternalStore } from 'react'

/** Nothing to subscribe to: these values are fixed for the life of the page. */
const neverChanges = () => () => {}

/**
 * Read a value that only exists in the browser — the timezone, the origin.
 *
 * Reading it during render would produce markup the server cannot produce, and
 * setting it from an effect causes the cascading render React now warns about.
 * `useSyncExternalStore` is the sanctioned third option: `null` while the server
 * HTML hydrates, the real value immediately after.
 *
 * `read` must return a primitive or a cached reference. A fresh object each call
 * makes React re-render forever.
 */
export function useBrowserValue<T>(read: () => T): T | null {
  return useSyncExternalStore<T | null>(neverChanges, read, () => null)
}
