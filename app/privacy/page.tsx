import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy — TempTime',
  description: 'What TempTime stores, what it never stores, and how long it lasts.',
}

/**
 * The privacy page.
 *
 * Written against what the code does, not what would sound best: every claim
 * here is one a reader could check against `supabase/migrations/0001_init.sql`,
 * `lib/roomSession.ts` or `lib/rateLimit.ts`. That includes the unflattering
 * parts — IP addresses are held in memory for rate limiting, and a room title
 * is stored verbatim — because a privacy page that only lists the good parts is
 * worth nothing to the person who has to trust it.
 *
 * PLAN.md section 11 wants this for its own sake and because Google's OAuth
 * verification requires a published policy before the calendar scope in section
 * 8.2 can be requested.
 */

const UPDATED = '2026-08-05'

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10">
      <Link
        href="/"
        className="mb-6 flex min-h-9 items-center text-sm text-zinc-500 hover:text-zinc-800 sm:min-h-0 dark:hover:text-zinc-200"
      >
        ← TempTime
      </Link>

      <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-2 text-sm text-zinc-500">Last updated {UPDATED}</p>

      <p className="mt-6 text-zinc-700 dark:text-zinc-300">
        TempTime finds a time everyone is free without anyone signing up, and without
        anyone — including us — learning what is actually in your calendar. This page
        says exactly what that means.
      </p>

      <Section title="There are no accounts">
        <p>
          You never register, and there is no password to lose. Joining a room issues
          your browser a token that works for that one room and expires when the room
          does. We have no way to link two rooms to the same person, because nothing
          about you persists between them.
        </p>
      </Section>

      <Section title="Only a string of 0s and 1s leaves your browser">
        <p>
          This is the whole design. You mark the times you are free. When you import a
          calendar file, it is read <em>in your browser</em>: you see the events, you
          untick any that should not count, and the ticked ones are subtracted from what
          you marked. What gets sent is a row of 0s and 1s — one digit per half-hour
          slot in the room, 1 meaning not available.
        </p>
        <p>
          Marking free time rather than busy time means less about you leaves at all.
          The two are opposites of each other, so in principle they carry the same
          information — but in practice nobody paints the whole opposite. You mark the
          few windows that suit you, and everything else is sent as unavailable without
          ever saying why.
        </p>
        <p>
          The event names, their real start and end times, how many events there were,
          and which app they came from all stay on your machine. They are never
          transmitted, so there is no version of a breach, a subpoena or a careless
          query that reveals them.
        </p>
      </Section>

      <Section title="What is stored on the server">
        <p>Three tables, and this is all of them:</p>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          <li>
            <strong>The room</strong> — its code, the title whoever created it typed,
            the dates chosen, the timezone, the daily start and end times, when it was
            created and when it expires.
          </li>
          <li>
            <strong>Each member</strong> — the display name they typed, when they
            joined, and when they last sent their times.
          </li>
          <li>
            <strong>Each submission</strong> — the 0/1 string described above, and a
            list of which kinds of source it came from (&ldquo;painted by hand&rdquo;,
            &ldquo;imported file&rdquo;), with no detail about any of them.
          </li>
        </ul>
        <p className="mt-3">
          The title and the display name are free text, so treat them as public to the
          room: if you type something sensitive into either, it is stored as you typed
          it.
        </p>
      </Section>

      <Section title="What other people in the room can see">
        <p>
          Your individual answer is never sent to anyone else&apos;s browser, not even
          in a form they would have to work to decode. Members see the room&apos;s{' '}
          <em>totals</em> — how many people are free in each slot — and who has
          answered. The table holding individual answers is readable only by the server;
          no client credential grants access to it at all.
        </p>
        <p>
          One honest caveat: while exactly one person has answered, the totals{' '}
          <em>are</em> that person&apos;s answer, because there is nothing to average
          them with. That is arithmetic, not a leak, but it is worth knowing before you
          are the first to submit.
        </p>
      </Section>

      <Section title="What stays on your own device">
        <p>
          Your room token, your member id, your display name and any times you have
          painted but not yet sent are kept in your browser&apos;s local storage, so
          that reloading the page does not make you join again. If you created the room,
          its admin secret is kept there too.
        </p>
        <p>
          Imported event names are held only for the tab you are using and are gone when
          you close it.
        </p>
        <p>
          A weekly timetable, if you paint one, is the one thing kept for longer than a
          single room: it stays in local storage on this device so the next room can
          reuse it. It holds weekdays and clock times only — no course names, no titles,
          nothing about what any of it is for — and it is never sent anywhere. Clear all
          of it from the timetable panel itself.
        </p>
        <p>
          Clearing your browser storage removes all of this; if you were the room&apos;s
          creator and did not save the admin link, you will no longer be able to delete
          it early.
        </p>
      </Section>

      <Section title="How long any of it lasts">
        <p>
          A room is destroyed once its last date has passed — automatically, on a
          schedule, whether or not anyone is watching. Deleting the room deletes every
          member and every submission with it, and the creator can do that at any time
          from the admin link. There is no archive and no backup we can restore from;
          gone means gone.
        </p>
      </Section>

      <Section title="Addresses, logs and counting">
        <p>
          To stop someone scripting their way through room codes, the server counts
          recent requests per IP address. Those counts live in memory, are never written
          to the database, and vanish when the server restarts. Whoever hosts the site
          will also keep ordinary request logs, as any web host does.
        </p>
        <p>
          There is no analytics, no advertising, no tracking pixel and no third-party
          script of any kind. The site sends a Content-Security-Policy that refuses to
          load code from anywhere but itself, so this is enforced rather than promised.
        </p>
      </Section>

      <Section title="Who else is involved">
        <p>
          The database is hosted by Supabase, on servers in Tokyo. They store what is
          listed above on our behalf and nothing more. Nothing is sold, shared or handed
          to anyone else.
        </p>
      </Section>

      <Section title="Connecting a calendar account">
        <p>
          Google Calendar, Todoist and TickTick are listed in the app as coming soon and
          are not connected yet — today the only ways in are painting by hand and
          importing a file. When they arrive, they will follow the same rule as
          everything above: the connection asks only for when you are busy, never for
          what you are doing, and what comes back can only be subtracted from the time
          you marked — a connected calendar never offers anything on your behalf. You
          will still untick anything you do not want counted, and only the 0/1 string
          will be sent. This page will be updated before any of it is switched on.
        </p>
      </Section>

      <Section title="Changes to this page">
        <p>
          If what the app does changes, this page changes with it, and the date at the
          top moves. Questions about any of it can go to whoever gave you the room link,
          or to the person running this instance.
        </p>
      </Section>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-medium">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        {children}
      </div>
    </section>
  )
}
