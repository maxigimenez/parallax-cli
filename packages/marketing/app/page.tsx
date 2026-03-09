import Link from 'next/link';
import { WorkflowDiagram } from '@/components/workflow-diagram';
import { getAllDocs } from '@/lib/docs';

const GITHUB_REPO_URL = process.env.NEXT_PUBLIC_GITHUB_URL ?? 'https://github.com/maxi134/parallax';

export default function HomePage() {
  const docs = getAllDocs();

  return (
    <main className="grid-noise relative min-h-screen overflow-hidden">
      <div className="mx-auto w-full max-w-6xl px-6 pb-24 pt-5 md:px-10">
        <header className="mb-20 flex items-center justify-between border-b border-white/10 pb-4">
          <Link href="/" className="font-mono text-xs tracking-[0.22em] text-white/78">
            PARALLAX
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/docs" className="px-3 py-1.5 font-mono text-xs text-white/70 transition hover:text-white">
              docs
            </Link>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-white/15 px-3 py-1.5 font-mono text-xs text-white/88 transition hover:border-white/25 hover:bg-white/5"
            >
              github
            </a>
          </nav>
        </header>

        <section className="mx-auto max-w-3xl text-center">
          <p className="mx-auto mb-5 inline-flex items-center rounded border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-white/65">
            Local AI orchestration runtime
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-white md:text-6xl">Infra for shipping ticket-driven AI work</h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-slate-300 md:text-lg">
            Pull tickets, launch your AI model in isolated worktrees, open PRs, and iterate on review feedback with a
            deterministic runtime loop.
          </p>

          <div className="mt-7 flex justify-center gap-2.5">
            <Link
              href="/docs"
              className="rounded border border-white/18 bg-white/5 px-4 py-2 font-mono text-xs uppercase tracking-[0.12em] text-white/90 transition hover:bg-white/10"
            >
              Read docs
            </Link>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-white/12 px-4 py-2 font-mono text-xs uppercase tracking-[0.12em] text-white/70 transition hover:border-white/22 hover:text-white"
            >
              View source
            </a>
          </div>

          <div className="terminal-window mx-auto mt-10 max-w-xl rounded-xl p-4 text-left">
            <div className="mb-4 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-white/35" />
              <span className="h-2 w-2 rounded-full bg-white/20" />
              <span className="h-2 w-2 rounded-full bg-white/10" />
              <span className="ml-2 font-mono text-[11px] text-white/40">terminal</span>
            </div>
            <div className="rounded border border-white/10 bg-black/50 p-4 font-mono text-sm leading-7">
              <p className="text-white/72">$ npm i -g parallax-cli</p>
              <p className="text-white/72">$ parallax preflight</p>
              <p className="text-white/72">$ parallax start --data-dir ./.parallax</p>
              <p className="text-white/88">
                runtime ready<span className="animate-cursor">_</span>
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-28 max-w-5xl border-t border-white/10 pt-12">
          <div className="mx-auto mb-8 max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">How it works</h2>
            <p className="mt-3 text-base leading-7 text-slate-300">Four deterministic stages, linked with live execution flow.</p>
          </div>
          <WorkflowDiagram />
        </section>

        <section className="mx-auto mt-28 max-w-5xl border-t border-white/10 pt-12">
          <div className="mb-8 flex flex-col items-start justify-between gap-3 md:flex-row md:items-end">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">Documentation</h2>
              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">
                Pages generated directly from the repository&apos;s <code>/docs</code> markdown content.
              </p>
            </div>
            <Link href="/docs" className="font-mono text-xs uppercase tracking-[0.12em] text-white/70 underline underline-offset-4">
              Open all
            </Link>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {docs.map((doc) => (
              <Link
                key={doc.slug}
                href={`/docs/${doc.slug}`}
                className="group rounded-lg border border-white/10 bg-white/[0.02] p-4 transition hover:border-white/20 hover:bg-white/[0.04]"
              >
                <h3 className="text-base font-semibold tracking-tight text-white/92">{doc.title}</h3>
                <p className="mt-2 max-h-[4.5rem] overflow-hidden text-sm leading-6 text-slate-300">{doc.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-3xl border-t border-white/10 pt-10 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/60">Install</p>
          <div className="mx-auto mt-4 max-w-md rounded border border-white/10 bg-black/45 px-4 py-3 font-mono text-sm text-white/90">
            npm i -g parallax-cli
          </div>
        </section>
      </div>
    </main>
  );
}
