import { LayoutDashboard, Shield, GitBranch, Terminal, Layers, Github } from "lucide-react";

const features = [
  {
    icon: <Terminal className="w-5 h-5" />,
    title: "Local-first",
    description: "Runs on your machine. Your code never leaves your environment.",
  },
  {
    icon: <GitBranch className="w-5 h-5" />,
    title: "Git-native",
    description: "Works with your existing git workflow. Branches, PRs, commits — all standard.",
  },
  {
    icon: <Layers className="w-5 h-5" />,
    title: "Ticket Integration",
    description: "Connects to Jira, Linear, GitHub Issues. Tickets become tasks automatically.",
  },
  {
    icon: <Shield className="w-5 h-5" />,
    title: "Plan → Approve → Execute",
    description: "AI never commits without your approval. You stay in control at every step.",
  },
  {
    icon: <LayoutDashboard className="w-5 h-5" />,
    title: "Dashboard UI",
    description: "Cancel, retry, and approve tasks visually. Monitor agents and browse logs in real time.",
  },
  {
    icon: <Github className="w-5 h-5" />,
    title: "Suggest Features",
    description: "Have an idea? Help shape parallax_ by suggesting features on GitHub Issues.",
    href: "https://github.com/maxigimenez",
    isExternal: true,
  },
];

const FeaturesSection = () => {
  return (
    <section className="py-24 border-t border-border">
      <div className="container max-w-4xl">
        <div className="mb-16">
          <h2 className="font-display text-3xl font-bold text-foreground">
            Built for developers who ship.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) =>
            feature.isExternal ? (
              <a
                key={index}
                href={feature.href}
                target="_blank"
                rel="noopener noreferrer"
                className="p-6 border border-primary/40 rounded-lg bg-primary/5 hover:bg-primary/10 hover:border-primary/60 transition-colors group cursor-pointer"
              >
                <div className="text-primary mb-3">{feature.icon}</div>
                <h3 className="font-display font-semibold text-primary mb-2">
                  {feature.title} →
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </a>
            ) : (
              <div
                key={index}
                className="p-6 border border-border rounded-lg bg-card hover:border-primary/30 transition-colors group"
              >
                <div className="text-primary mb-3 group-hover:glow-orange transition-all">
                  {feature.icon}
                </div>
                <h3 className="font-display font-semibold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            )
          )}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
