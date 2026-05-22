import { LayoutDashboard, Terminal } from "lucide-react";
import TerminalBlock from "./TerminalBlock";

const wizardLines: { number: number; content: React.ReactNode; isCommand?: boolean }[] = [
  { number: 1, content: <span className="text-foreground">$ parallax init</span>, isCommand: true },
  { number: 2, content: <span className="text-primary">parallax_</span> },
  { number: 3, content: "Local-first AI orchestration runtime" },
  { number: 4, content: "" },
  { number: 5, content: "◆ Welcome — let's get you set up" },
  { number: 6, content: "│" },
  { number: 7, content: <><span className="text-primary">◆</span> Project ID <span className="opacity-50">my-app</span></> },
  { number: 8, content: <><span className="text-primary">◆</span> Local git repo path <span className="opacity-50">~/code/my-app</span></> },
  { number: 9, content: <><span className="text-primary">◆</span> Issue source ▸ <span className="text-foreground">Linear</span></> },
  { number: 10, content: <><span className="text-primary">◆</span> AI agent ▸ <span className="text-foreground">Claude Code</span></> },
  { number: 11, content: <><span className="text-primary">◆</span> Model ▸ <span className="text-foreground">claude-opus-4-7</span></> },
  { number: 12, content: <><span className="text-primary">◆</span> Connect Slack? <span className="text-foreground">yes</span></> },
  { number: 13, content: "│" },
  { number: 14, content: <span className="text-primary">Setup complete.</span> },
  { number: 15, content: "Run 'parallax start' to begin." },
];

const ConfigSection = () => {
  return (
    <section className="py-24 border-t border-border">
      <div className="container max-w-4xl">
        <div className="mb-16">
          <h2 className="font-display text-3xl font-bold text-foreground">
            From wizard to dashboard.
          </h2>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed max-w-xl">
            One interactive command sets up your first project, agent, and integrations.
            Everything else — additional projects, secrets, Slack — lives in the dashboard.
          </p>
        </div>

        <TerminalBlock title="parallax init" lines={wizardLines} />

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border/70 bg-card/40 p-5">
            <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <Terminal className="h-4 w-4" />
            </div>
            <p className="mb-1 text-xs uppercase tracking-[0.22em] text-primary">Guided setup</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Pick your repo, ticket source, AI agent, and optional Slack channel.
              Config is stored at <code className="text-primary">~/.parallax/config.json</code> — managed for you.
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/40 p-5">
            <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <LayoutDashboard className="h-4 w-4" />
            </div>
            <p className="mb-1 text-xs uppercase tracking-[0.22em] text-primary">Dashboard-managed</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Add more projects, rotate secrets, and reconfigure integrations from the dashboard
              without ever editing a file.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ConfigSection;
