import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "./ui/button";
import { renderHighlightedCode } from "../lib/code-highlighting";

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  className?: string;
}

const CodeBlock = ({ code, language, title, className }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);
  const trimmedCode = useMemo(() => code.replace(/\n+$/, ""), [code]);
  const highlightedCode = useMemo(
    () => renderHighlightedCode(trimmedCode, language),
    [trimmedCode, language]
  );

  async function handleCopy() {
    await navigator.clipboard.writeText(trimmedCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-border bg-card/70 shadow-[0_24px_80px_rgba(0,0,0,0.25)] ${className ?? ""}`}
    >
      <div className="flex items-center justify-between gap-4 border-b border-border/80 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-primary/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
          </div>
          {(title || language) && (
            <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
              {title ?? language}
            </span>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="h-8 gap-2 border-border/80 bg-background px-3 text-xs text-foreground hover:bg-primary/10 hover:text-foreground"
          aria-label={copied ? "Copied code" : "Copy code"}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <pre className="overflow-x-auto px-4 py-4 text-sm leading-7 text-foreground">
        <code>{highlightedCode ?? trimmedCode}</code>
      </pre>
    </div>
  );
};

export default CodeBlock;
