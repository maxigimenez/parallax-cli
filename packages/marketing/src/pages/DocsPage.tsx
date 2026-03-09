import { useParams, Link } from "react-router-dom";
import { useState } from "react";
import { Menu } from "lucide-react";
import Layout from "../components/Layout";
import MarkdownRenderer, { useMarkdown } from "../components/MarkdownRenderer";
import { Sheet, SheetContent, SheetTrigger } from "../components/ui/sheet";
import { Button } from "../components/ui/button";

const docPages = [
  { slug: "getting-started", title: "Getting Started", file: "/docs/getting-started.md" },
  { slug: "configuration", title: "Configuration", file: "/docs/configuration.md" },
  { slug: "cli-reference", title: "CLI Reference", file: "/docs/cli-reference.md" },
  { slug: "task-lifecycle", title: "Task Lifecycle", file: "/docs/task-lifecycle.md" },
  { slug: "troubleshooting", title: "Troubleshooting", file: "/docs/troubleshooting.md" },
];

const DocsPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [open, setOpen] = useState(false);
  const currentSlug = slug || "getting-started";
  const currentPage = docPages.find((p) => p.slug === currentSlug);
  const filePath = currentPage?.file || "/docs/getting-started.md";
  const { content, loading } = useMarkdown(filePath);

  return (
    <Layout>
      <div className="container max-w-5xl py-12">
        <div className="flex gap-12">
          {/* Sidebar */}
          <aside className="hidden lg:block w-48 flex-shrink-0">
            <div className="sticky top-20">
              <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                Documentation
              </span>
              <nav className="mt-4 space-y-1">
                {docPages.map((page) => (
                  <Link
                    key={page.slug}
                    to={`/docs/${page.slug}`}
                    className={`block text-sm py-1.5 transition-colors font-mono ${
                      currentSlug === page.slug
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {page.title}
                  </Link>
                ))}
              </nav>
            </div>
          </aside>

          {/* Content */}
          <main className="flex-1 min-w-0">
            {/* Mobile nav - Expandable menu */}
            <div className="lg:hidden mb-8">
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="flex items-center gap-2">
                    <Menu className="h-4 w-4" />
                    Menu
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64">
                  <div className="mt-8">
                    <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                      Documentation
                    </span>
                    <nav className="mt-4 space-y-1">
                      {docPages.map((page) => (
                        <Link
                          key={page.slug}
                          to={`/docs/${page.slug}`}
                          onClick={() => setOpen(false)}
                          className={`block text-sm py-2 px-2 rounded transition-colors font-mono ${
                            currentSlug === page.slug
                              ? "text-primary bg-primary/10"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                          }`}
                        >
                          {page.title}
                        </Link>
                      ))}
                    </nav>
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {loading ? (
              <div className="text-muted-foreground text-sm font-mono">Loading...</div>
            ) : content ? (
              <MarkdownRenderer content={content} />
            ) : (
              <div className="text-muted-foreground text-sm font-mono">
                Page not found.
              </div>
            )}

            {/* Prev / Next navigation */}
            {currentPage && (
              <div className="flex justify-between mt-16 pt-8 border-t border-border">
                {(() => {
                  const idx = docPages.findIndex((p) => p.slug === currentSlug);
                  const prev = idx > 0 ? docPages[idx - 1] : null;
                  const next = idx < docPages.length - 1 ? docPages[idx + 1] : null;
                  return (
                    <>
                      <div>
                        {prev && (
                          <Link
                            to={`/docs/${prev.slug}`}
                            className="text-sm font-mono text-muted-foreground hover:text-primary transition-colors"
                          >
                            ← {prev.title}
                          </Link>
                        )}
                      </div>
                      <div>
                        {next && (
                          <Link
                            to={`/docs/${next.slug}`}
                            className="text-sm font-mono text-muted-foreground hover:text-primary transition-colors"
                          >
                            {next.title} →
                          </Link>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </main>
        </div>
      </div>
    </Layout>
  );
};

export default DocsPage;
