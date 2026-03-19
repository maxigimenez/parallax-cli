import type { ReactNode } from "react";
import { MessageSquareCode, RotateCcw } from "lucide-react";

type IntegrationItem = {
  href: string;
  logo: string | ReactNode;
  label: string;
  imgClass?: string;
};

const IconCard = ({
  href,
  logo,
  label,
  imgClass,
}: {
  href: string;
  logo: string | ReactNode;
  label: string;
  imgClass?: string;
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="flex flex-col items-center gap-3 group"
  >
    <div className="w-14 h-14 rounded-xl bg-secondary border border-border flex items-center justify-center group-hover:border-primary/40 transition-colors">
      {typeof logo === "string" ? (
        <img src={logo} alt={label} className={`w-7 h-7 ${imgClass || ""}`} />
      ) : (
        logo
      )}
    </div>
    <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors text-center font-mono">
      {label}
    </span>
  </a>
);

const steps: Array<{ label: string; items: IntegrationItem[] }> = [
  {
    label: "Pulling",
    items: [
      { href: "https://linear.app", logo: "/logos/linear.svg", label: "Linear" },
      { href: "https://github.com", logo: "/logos/github.svg", label: "GitHub" },
    ],
  },
  {
    label: "Running",
    items: [
      { href: "https://openai.com/codex", logo: "/logos/codex.svg", label: "Codex", imgClass: "invert" },
      { href: "https://claude.ai/code", logo: "/logos/claude.svg", label: "Claude Code" },
      { href: "https://deepmind.google/technologies/gemini", logo: "/logos/gemini.svg", label: "Gemini" },
    ],
  },
  {
    label: "Result",
    items: [
      { href: "https://github.com", logo: "/logos/github.svg", label: "Pull Request" },
    ],
  },
  {
    label: "Review",
    items: [
      {
        href: "https://github.com",
        logo: (<MessageSquareCode className="w-6 h-6 text-muted-foreground" />),
        label: "PR Reviews",
      },
    ],
  },
];

const VLine = () => (
  <div className="w-px h-8 bg-border flex-shrink-0" />
);

const IntegrationsSection = () => {
  return (
    <section className="py-24 border-t border-border">
      <div className="container max-w-4xl">
        <div className="mb-16">
          <h2 className="font-display text-3xl font-bold text-foreground">
            Plug into your stack.
          </h2>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed max-w-xl">
            parallax_ connects to the agents and ticket systems you already use — in a continuous loop.
          </p>
        </div>

        {/* Desktop: horizontal flow with background connector line */}
        <div className="hidden md:block">
          <div className="relative">
            {/* Continuous line behind icons at their vertical center: label(~12px) + mb-4(16px) + half icon(28px) = 56px */}
            <div className="absolute left-[76px] right-[76px] top-[56px] h-px bg-border" />

            <div className="flex justify-between max-w-[700px] mx-auto relative">
              {steps.map((step) => (
                <div key={step.label} className="flex flex-col items-center">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-4">
                    {step.label}
                  </span>
                  <div className="flex gap-4 bg-background px-3 relative z-10">
                    {step.items.map((item) => (
                      <IconCard
                        key={item.label}
                        href={item.href}
                        logo={item.logo}
                        label={item.label}
                        imgClass={item.imgClass}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center mt-10 gap-2 text-primary/50">
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="text-xs font-mono text-muted-foreground">continuous cycle</span>
          </div>
        </div>

        {/* Mobile: vertical flow */}
        <div className="flex flex-col items-center md:hidden">
          {steps.map((step, i) => (
            <div key={step.label} className="flex flex-col items-center">
              {i > 0 && <VLine />}
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-4 mt-2">
                {step.label}
              </span>
              <div className="flex gap-4 justify-center">
                {step.items.map((item) => (
                  <IconCard
                    key={item.label}
                    href={item.href}
                    logo={item.logo}
                    label={item.label}
                    imgClass={item.imgClass}
                  />
                ))}
              </div>
            </div>
          ))}

          <div className="flex items-center gap-2 text-primary/50 mt-8">
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="text-xs font-mono text-muted-foreground">continuous cycle</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default IntegrationsSection;
