import { getNotes } from "@/lib/db";

export default function Home() {
  const notes = getNotes();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-3xl font-semibold">Next.js + SQLite</h1>
      <p className="text-zinc-600 dark:text-zinc-300">
        Все приложение работает на Next.js, а данные хранятся в SQLite.
      </p>
      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <h2 className="mb-3 text-xl font-medium">Notes from SQLite</h2>
        <ul className="list-disc space-y-2 pl-5">
          {notes.map((note) => (
            <li key={note.id}>{note.text}</li>
          ))}
        </ul>
      </section>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        API endpoint: <code>/api/notes</code>
      </p>
    </main>
  );
}
