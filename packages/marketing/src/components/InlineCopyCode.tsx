import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface InlineCopyCodeProps {
  code: string;
  shellPrompt?: boolean;
}

const InlineCopyCode = ({ code, shellPrompt = false }: InlineCopyCodeProps) => {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-foreground">
      <code className="font-mono text-sm">
        {shellPrompt ? <span className="mr-1 text-primary">$</span> : null}
        {code}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Copied inline code" : "Copy inline code"}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/80 bg-background text-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
};

export default InlineCopyCode;
