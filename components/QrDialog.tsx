'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

interface QrDialogProps {
  url: string
  onClose: () => void
}

/**
 * QR for the room link, rendered from a data URL generated in the browser.
 *
 * Nothing is sent anywhere to produce it: a room link handed to an image
 * service would leak the one credential needed to enter the room.
 */
export default function QrDialog({ url, onClose }: QrDialogProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    QRCode.toDataURL(url, { width: 512, margin: 2 })
      .then((png) => {
        if (live) setDataUrl(png)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [url])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-xl dark:bg-zinc-900"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Room QR code"
      >
        <div className="flex aspect-square items-center justify-center rounded-xl bg-white">
          {dataUrl !== null && (
            // eslint-disable-next-line @next/next/no-img-element -- a local data URL has nothing for next/image to optimise
            <img src={dataUrl} alt={`QR code for ${url}`} className="h-full w-full" />
          )}
          {failed && (
            <p className="p-4 text-sm text-zinc-500">
              Could not draw the QR code. The link below still works.
            </p>
          )}
        </div>
        <p className="mt-3 break-all text-xs text-zinc-500">{url}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-zinc-100 px-4 py-2 text-sm font-medium hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
        >
          Close
        </button>
      </div>
    </div>
  )
}
