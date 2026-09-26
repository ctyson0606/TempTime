'use client'

import { useCallback, useSyncExternalStore } from 'react'

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

/**
 * Whether a media query matches, kept current as it changes.
 *
 * `false` on the server, where there is no screen to ask about. Components that
 * pick a default from this should render nothing size-dependent until they
 * know, or accept that the server pass guessed wide.
 */
export function useMediaQuery(query: string): boolean {
  // Stable per query: a subscribe function recreated every render makes React
  // unsubscribe and resubscribe on every render.
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}
