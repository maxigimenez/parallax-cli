import { ArrowDown, GitPullRequest, Bot, CheckCircle } from "lucide-react";

const steps = [
  {
    icon: <Bot className="w-5 h-5" />,
    title: "Ticket Created",
    description: "A new ticket is created in your project management tool (Jira, Linear, GitHub Issues).",
    terminal: "$ parallax detected ticket PROJ-142",
  },
  {
    icon: <ArrowDown className="w-5 h-5" />,
    title: "Agent Plans",
    description: "An AI agent spins up, analyzes the codebase and ticket, then generates a detailed implementation plan for your review.",
    terminal: "$ parallax plan --ticket PROJ-142\n  → analyzing codebase...\n  → plan ready for review",
  },
  {
    icon: <GitPullRequest className="w-5 h-5" />,
    title: "Approved → PR Opened",
    description: "Once you approve the plan, the agent implements the changes and opens a pull request automatically.",
    terminal: "$ parallax execute --approved\n  → implementing changes...\n  → PR #87 opened",
  },
  {
    icon: <CheckCircle className="w-5 h-5" />,
    title: "Feedback → Iterate",
    description: "Review the PR. Leave feedback. A new agent session spins up to address comments and push updates.",
    terminal: "$ parallax review --pr 87\n  → processing feedback...\n  → changes committed",
  },
];

const FlowSection = () => {
  return (
    <section className="py-24 border-t border-border">
      <div className="container max-w-4xl">
        <div className="mb-16">
          <h2 className="font-display text-3xl font-bold text-foreground">
            From ticket to merged PR, autonomously.
          </h2>
        </div>

        <div className="space-y-0">
          {steps.map((step, index) => (
            <div key={index} className="relative">
              {/* Connector line */}
              {index < steps.length - 1 && (
                <div className="absolute left-[19px] top-[52px] bottom-0 w-px bg-border animate-timeline-draw" />
              )}
              
              <div className="flex gap-6 pb-12">
                {/* Icon */}
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-secondary border border-border flex items-center justify-center text-primary relative z-10">
                  {step.icon}
                </div>

                {/* Content */}
                <div className="flex-1 pt-1">
                  <h3 className="font-display text-lg font-semibold text-foreground mb-1">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground text-sm mb-4 leading-relaxed">
                    {step.description}
                  </p>
                  <div className="bg-card border border-border rounded-md p-4 font-mono text-xs text-muted-foreground whitespace-pre-line">
                    {step.terminal}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FlowSection;
