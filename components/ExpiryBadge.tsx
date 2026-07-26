import { DateTime } from 'luxon'

interface ExpiryBadgeProps {
  /** ISO instant from the room's `expiresAt`. */
  expiresAt: string
  timezone: string
}

/**
 * Standing notice of when the room destroys itself.
 *
 * Shown in the room's timezone, not the reader's: every other time on the page
 * is in room time, and mixing the two is how people show up an hour late.
 */
export default function ExpiryBadge({ expiresAt, timezone }: ExpiryBadgeProps) {
  const when = DateTime.fromISO(expiresAt, { zone: timezone })
  if (!when.isValid) return null

  return (
    <p className="text-xs text-zinc-500">
      This room and everything in it is deleted on{' '}
      <span className="font-medium text-zinc-600 dark:text-zinc-400">
        {when.toFormat('yyyy-MM-dd HH:mm')}
      </span>{' '}
      ({timezone}).
    </p>
  )
}
