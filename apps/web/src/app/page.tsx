import { connection } from "next/server";

export default async function HomePage() {
  // Dynamic rendering: every response gets its own CSP nonce.
  await connection();
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-xl font-semibold">Read-Watch-Tracker</h1>
    </main>
  );
}
