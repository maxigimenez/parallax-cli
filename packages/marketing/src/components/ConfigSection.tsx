import TerminalBlock from "./TerminalBlock";

const configLines = [
  { number: 1, isCommand: false, content: <span><span className="text-primary">- id</span>: <span className="text-foreground">www</span></span> },
  { number: 2, isCommand: false, content: <span><span className="text-primary">&nbsp;&nbsp;workspaceDir</span>: <span className="text-muted-foreground">/Users/maxi/projects/www</span></span> },
  { number: 3, isCommand: false, content: <span><span className="text-primary">&nbsp;&nbsp;pullFrom</span>:</span> },
  { number: 4, isCommand: false, content: <span><span className="text-primary">&nbsp;&nbsp;&nbsp;&nbsp;provider</span>: <span className="text-foreground">github</span></span> },
  { number: 5, isCommand: false, content: <span><span className="text-primary">&nbsp;&nbsp;&nbsp;&nbsp;filters</span>:</span> },
  { number: 6, isCommand: false, content: <span><span className="text-primary">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;owner</span>: <span className="text-foreground">maxigimenez</span></span> },
  { number: 7, isCommand: false, content: <span><span className="text-primary">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;repo</span>: <span className="text-foreground">www</span></span> },
  { number: 8, isCommand: false, content: <span><span className="text-primary">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;state</span>: <span className="text-foreground">open</span></span> },
  { number: 9, isCommand: false, content: <span><span className="text-primary">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;labels</span>: <span className="text-muted-foreground">[ai-ready]</span></span> },
  { number: 10, isCommand: false, content: <span><span className="text-primary">&nbsp;&nbsp;agent</span>:</span> },
  { number: 11, isCommand: false, content: <span><span className="text-primary">&nbsp;&nbsp;&nbsp;&nbsp;provider</span>: <span className="text-foreground">codex</span></span> },
  { number: 12, isCommand: false, content: <span><span className="text-primary">&nbsp;&nbsp;&nbsp;&nbsp;model</span>: <span className="text-foreground">gpt-5.3-codex</span></span> },
  { number: 13, isCommand: false, content: <span><span className="text-primary">&nbsp;&nbsp;&nbsp;&nbsp;sandbox</span>: <span className="text-foreground">true</span></span> },
];

const ConfigSection = () => {
  return (
    <section className="py-24 border-t border-border">
      <div className="container max-w-4xl">
        <div className="mb-16">
          <h2 className="font-display text-3xl font-bold text-foreground">
            One config per project.
          </h2>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed max-w-xl">
            Define your project, providers, and agent preferences in a{" "}
            <span className="text-primary font-mono">project.yml</span> file.
            Register it with a single command and parallax_ handles the rest.
          </p>
        </div>

        <TerminalBlock title="project.yml" lines={configLines} />

        <div className="mt-8 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Then register it:</span>
          <code className="font-mono text-sm bg-secondary border border-border rounded-lg px-4 py-2 text-foreground">
            <span className="text-primary">$</span> parallax register project.yml
          </code>
        </div>
      </div>
    </section>
  );
};

export default ConfigSection;
