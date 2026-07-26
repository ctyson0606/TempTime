/**
 * The contract every busy-time source implements.
 *
 * Adding a platform later is a new file in this directory plus an OAuth callback
 * route; nothing above this layer changes. See PLAN.md section 8.
 */
export type ProviderId = 'manual' | 'ics' | 'google' | 'todoist' | 'ticktick'

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
