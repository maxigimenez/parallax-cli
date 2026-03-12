import Navbar from "./Navbar";

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      {children}
      <footer className="border-t border-border py-6">
        <div className="container max-w-4xl">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span className="font-mono">
              parallax<span className="text-primary animate-blink">_</span>
            </span>
            <a
              href="https://github.com/maxigimenez/parallax-cli"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 transition-colors text-xs font-mono"
            >
              built by @maxigimenez
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
