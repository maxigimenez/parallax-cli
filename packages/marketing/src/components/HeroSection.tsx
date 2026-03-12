import { Download, ListPlus, MessageSquareMore } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "./ui/badge";
import CodeBlock from "./CodeBlock";

const HeroSection = () => {
  return (
    <section className="py-24">
      <div className="container max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight text-foreground">
            parallax<span className="text-primary animate-blink">_</span>
          </h1>
          <Badge
            variant="outline"
            className="border-primary/40 bg-primary/10 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-primary"
          >
            Alpha
          </Badge>
        </div>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-12 leading-relaxed">
          A local AI orchestrator that turns tickets into isolated work, staged plans, and reviewable pull requests.
          You stay in control of approvals, retries, and follow-up review work.
        </p>

        <CodeBlock
          title="First run"
          code={`npm i -g parallax-cli
parallax preflight
parallax start
parallax register ./parallax.yml`}
          className="mb-6"
        />

        <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-card/40 p-4">
            <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <Download className="h-4 w-4" />
            </div>
            <p className="mb-1 text-xs uppercase tracking-[0.22em] text-primary">Install</p>
            <p>Set up the CLI, run preflight, and start the local runtime.</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/40 p-4">
            <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <ListPlus className="h-4 w-4" />
            </div>
            <p className="mb-1 text-xs uppercase tracking-[0.22em] text-primary">Register</p>
            <p>Add each repository with its own <code className="text-primary">parallax.yml</code>.</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/40 p-4">
            <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <MessageSquareMore className="h-4 w-4" />
            </div>
            <p className="mb-1 text-xs uppercase tracking-[0.22em] text-primary">Review</p>
            <p>Use the dashboard for plan approval, logs, retries, and PR follow-up.</p>
          </div>
        </div>

        <div className="mt-8 flex justify-center">
          <Link
            to="/docs/getting-started"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-mono text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
          >
            Get Started →
          </Link>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
