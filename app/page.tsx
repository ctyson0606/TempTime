import CreateRoomForm from '@/components/CreateRoomForm'
import JoinByCode from '@/components/JoinByCode'

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-5 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">TempTime</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Find a time everyone is free. No accounts, and nobody sees what your calendar
          actually says.
        </p>
      </header>

      <CreateRoomForm />

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Been given a code?</p>
        <JoinByCode />
      </footer>
    </main>
  )
}
