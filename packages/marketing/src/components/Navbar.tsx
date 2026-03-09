import { Link, useLocation } from "react-router-dom";

const Navbar = () => {
  const location = useLocation();

  const links = [
    { label: "parallax_", path: "/", isLogo: true },
    { label: "docs", path: "/docs/getting-started" },
    { label: "github", path: "https://github.com/parallax", external: true },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="container flex items-center h-12">
        <div className="flex items-center gap-0">
          {links.map((link) => {
            const isActive = !link.external && location.pathname.startsWith(link.path);
            
            if (link.external) {
              return (
                <a
                  key={link.label}
                  href={link.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.label}
                </a>
              );
            }

            return (
              <Link
                key={link.label}
                to={link.path}
                className={`px-4 py-3 text-sm transition-colors ${
                  link.isLogo
                    ? "font-bold text-primary"
                    : isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.isLogo ? (
                  <span>
                    parallax<span className="animate-blink">_</span>
                  </span>
                ) : (
                  link.label
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
