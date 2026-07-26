'use client'

import type { HeatmapMember } from '@/lib/roomClient'

interface MemberListProps {
  members: readonly HeatmapMember[]
  /** This browser's own participant id, so one row can be marked "you". */
  youId: string | null
}

/**
 * Who is in the room and who has answered.
 *
 * A `submitted` flag is the most this can say, and that is by design: the server
 * never sends anyone's mask, so there is nothing here to leak even by accident
 * (PLAN.md section 6).
 */
export default function MemberList({ members, youId }: MemberListProps) {
  if (members.length === 0) {
    return <p className="mt-2 text-sm text-zinc-500">Nobody has joined yet.</p>
  }

  const sent = members.filter((m) => m.submitted).length

  return (
    <div className="mt-2 flex flex-col gap-2">
      <p className="text-xs text-zinc-500">
        {sent} of {members.length} {members.length === 1 ? 'person' : 'people'} have
        sent their times.
      </p>
      <ul aria-label="Members" className="flex flex-col gap-1">
        {members.map((member) => (
          <li
            key={member.id}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="truncate">
              {member.displayName}
              {member.id === youId && <span className="text-zinc-400"> — you</span>}
            </span>
            <span
              className={[
                'shrink-0 rounded-full px-2 py-0.5 text-xs',
                member.submitted
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
              ].join(' ')}
            >
              {member.submitted ? 'Sent' : 'Waiting'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
