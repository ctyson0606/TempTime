'use client'

import { useEffect, useState } from 'react'

interface CopyButtonProps {
  value: string
  label?: string
  className?: string
}

/**
 * Copy to clipboard with the result stated on the button itself.
 *
 * The clipboard API rejects on insecure origins and when the browser withholds
 * permission, so the failure is surfaced rather than swallowed — a button that
 * says "Copied" without copying sends people off to share a link they do not
 * have.
 */
export default function CopyButton({
  value,
  label = 'Copy',
  className,
}: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    if (state === 'idle') return
    const timer = setTimeout(() => setState('idle'), 2000)
    return () => clearTimeout(timer)
  }, [state])

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value).then(
          () => setState('copied'),
          () => setState('failed'),
        )
      }}
      className={
        className ??
        'rounded-xl bg-zinc-100 px-3 py-2 text-sm font-medium hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700'
      }
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
    </button>
  )
}
