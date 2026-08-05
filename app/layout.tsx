import type { Metadata } from 'next'
import Link from 'next/link'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'TempTime',
  description: 'Find a time everyone is free, without anyone signing up.',
}

/**
 * Every page is rendered per request, because every page carries a per-request
 * CSP nonce (`proxy.ts`).
 *
 * Next stamps the nonce on its inline scripts while rendering. A prerendered
 * page is not rendered while a request is in flight, so it keeps whatever
 * nonce it was built with — none — and our own header then blocks the page's
 * own bootstrap. Nothing in Next's response cache knows about nonces, so this
 * does not resolve itself. Observed, not assumed: with `/` static, the home
 * page served a 200 and never hydrated.
 *
 * The price is the full route cache, and it is close to nothing here. Both
 * pages fetch everything they show from the API after hydration, so a
 * prerendered shell was only ever saving the render of a header.
 */
export const dynamic = 'force-dynamic'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* In the layout rather than on each page: the privacy page is the one
            thing every page must be able to reach, and a footer that exists on
            some routes is the same as not having one. Pages carry `flex-1`, so
            this settles at the bottom on short pages instead of floating. */}
        <footer className="mx-auto w-full max-w-2xl px-5 pb-8 text-xs text-zinc-400">
          <Link
            href="/privacy"
            className="inline-flex min-h-9 items-center hover:text-zinc-600 sm:min-h-0 dark:hover:text-zinc-300"
          >
            Privacy
          </Link>
        </footer>
      </body>
    </html>
  )
}
