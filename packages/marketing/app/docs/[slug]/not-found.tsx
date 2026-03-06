import Link from 'next/link';

export default function DocNotFoundPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center px-6 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-terminal">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Documentation page not found</h1>
      <p className="mt-3 text-slate-300">The requested markdown file does not exist in /docs.</p>
      <Link
        href="/docs"
        className="mt-6 rounded-md border border-white/20 bg-black/40 px-4 py-2 font-mono text-sm text-white transition hover:bg-white/10"
      >
        Go to docs index
      </Link>
    </main>
  );
}
