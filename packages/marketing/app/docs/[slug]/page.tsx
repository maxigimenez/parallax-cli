import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAllDocs, getDocBySlug } from '@/lib/docs';
import { markdownToHtml } from '@/lib/markdown';

export function generateStaticParams() {
  return getAllDocs().map((doc) => ({ slug: doc.slug }));
}

export default function DocPage({ params }: { params: { slug: string } }) {
  const doc = getDocBySlug(params.slug);

  if (!doc) {
    return notFound();
  }

  const docs = getAllDocs();
  const rendered = markdownToHtml(doc.markdown);

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-7xl gap-8 px-6 pb-16 pt-10 md:grid-cols-[280px_1fr] md:px-10">
      <aside className="h-fit rounded-xl border border-white/10 bg-black/35 p-4 md:sticky md:top-8">
        <Link href="/" className="font-mono text-xs uppercase tracking-[0.16em] text-white/70 transition hover:text-white">
          Marketing home
        </Link>
        <h2 className="mt-4 border-b border-white/10 pb-3 text-sm font-semibold uppercase tracking-[0.16em] text-white/80">
          Docs
        </h2>
        <nav className="mt-3 space-y-1">
          {docs.map((entry) => (
            <Link
              key={entry.slug}
              href={`/docs/${entry.slug}`}
              className={`block rounded-md px-3 py-2 text-sm transition ${
                entry.slug === doc.slug
                  ? 'bg-white/10 text-white'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              {entry.title}
            </Link>
          ))}
        </nav>
      </aside>

      <article className="rounded-xl border border-white/10 bg-black/45 px-5 py-6 md:px-10 md:py-8">
        <div
          className="max-w-none"
          dangerouslySetInnerHTML={{
            __html: rendered
          }}
        />
      </article>
    </main>
  );
}
