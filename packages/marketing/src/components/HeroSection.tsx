import { Link } from "react-router-dom";
import TerminalBlock from "./TerminalBlock";

const HeroSection = () => {
  return (
    <section className="py-24">
      <div className="container max-w-4xl">
        {/* Big title */}
        <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight mb-6 text-foreground">
          parallax<span className="text-primary animate-blink">_</span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-12 leading-relaxed">
          A local AI orchestrator that connects your git projects with ticket systems. 
          Agents plan, execute, and iterate — you stay in control.
        </p>

        {/* Install terminal */}
        <TerminalBlock
          title="~/your-project"
          lines={[
            {
              number: 1,
              isCommand: true,
              content: (
                <span>
                  <span className="text-primary">$</span> npm i -g parallax-cli
                </span>
              ),
            },
            {
              number: 2,
              isCommand: true,
              content: (
                <span>
                  <span className="text-primary">$</span> parallax preflight
                </span>
              ),
            },
            {
              number: 3,
              content: (
                <span className="text-terminal-green">
                  ✓ git configured{"\n"}
                </span>
              ),
            },
            {
              number: 4,
              content: (
                <span className="text-terminal-green">
                  ✓ ticket system connected (Linear)
                </span>
              ),
            },
            {
              number: 5,
              content: (
                <span className="text-terminal-green">
                  ✓ AI provider ready
                </span>
              ),
            },
            {
              number: 6,
              isCommand: true,
              content: (
                <span>
                  <span className="text-primary">$</span> parallax start
                </span>
              ),
            },
            {
              number: 7,
              content: (
                <span className="text-primary">
                  ▸ orchestra running on http://localhost:3000
                  <span className="animate-blink">█</span>
                </span>
              ),
            },
          ]}
        />

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
