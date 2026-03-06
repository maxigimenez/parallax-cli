import Link from 'next/link';
import { getAllDocs } from '@/lib/docs';

export default function DocsIndexPage() {
  const docs = getAllDocs();

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 pb-16 pt-10 md:px-10">
      <div className="mb-8 flex items-center justify-between gap-3">
        <Link href="/" className="font-mono text-sm text-white/70 transition hover:text-white">
          &larr; Back to marketing page
        </Link>
      </div>

      <h1 className="text-4xl font-semibold tracking-tight text-white">Documentation</h1>
      <p className="mt-3 max-w-2xl text-slate-300">Generated from the markdown files in the repository&apos;s /docs folder.</p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {docs.map((doc) => (
          <Link
            key={doc.slug}
            href={`/docs/${doc.slug}`}
            className="rounded-lg border border-white/12 bg-white/[0.02] p-5 transition hover:border-white/20 hover:bg-white/[0.04]"
          >
            <h2 className="text-xl font-semibold tracking-tight text-white">{doc.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">{doc.description}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
