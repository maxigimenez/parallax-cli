import CodeBlock from "./CodeBlock";
import InlineCopyCode from "./InlineCopyCode";

const configExample = `- id: example-repo
  workspaceDir: /absolute/path/to/your/repo
  pullFrom:
    provider: github
    filters:
      owner: your-github-org-or-user
      repo: your-repo
      state: open
      labels: [ai-ready]
  agent:
    provider: codex
    model: gpt-5.4`;

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
            <span className="text-primary font-mono">parallax.yml</span> file.
            Register it with a single command and parallax_ handles the rest.
          </p>
        </div>

        <CodeBlock title="parallax.yml" language="yaml" code={configExample} />

        <div className="mt-8 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Then register it:</span>
          <InlineCopyCode code="parallax register ./parallax.yml" shellPrompt />
        </div>
      </div>
    </section>
  );
};

export default ConfigSection;
