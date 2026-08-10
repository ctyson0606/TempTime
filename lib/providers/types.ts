/**
 * Every way busy time gets in.
 *
 * Adding a platform later is a new file in this directory plus an OAuth callback
 * route; nothing above this layer changes. See PLAN.md section 8.
 *
 * `manual` and `weekly` are sources without a provider: there is nothing to
 * connect to and nothing to fetch, the drag *is* the input. They are ids anyway,
 * because a submission records where its slots came from and the picker lists
 * every way in.
 */
export type ProviderId = 'manual' | 'weekly' | 'ics' | 'google' | 'todoist' | 'ticktick'

export interface BusyBlock {
  id: string
  start: Date
  end: Date
  /**
   * Shown in the privacy checklist so a user can recognise what they are
   * unticking. It never leaves the browser — only the 0/1 mask is submitted.
   */
  label?: string
  source: ProviderId
}

export interface BusyProvider {
  id: ProviderId
  displayName: string
  /** False makes the UI offer it as "coming soon" rather than a live option. */
  isAvailable(): boolean
  /** OAuth redirect, or a file picker. */
  connect(): Promise<void>
  fetchBusy(range: { from: Date; to: Date }): Promise<BusyBlock[]>
}
