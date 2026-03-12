import type { ReactNode } from "react";

type HighlightToken = {
  content: string;
  className?: string;
};

function renderTokens(tokens: HighlightToken[], keyPrefix: string) {
  return tokens.map((token, index) => (
    <span key={`${keyPrefix}-${index}`} className={token.className}>
      {token.content}
    </span>
  ));
}

function highlightYamlLine(line: string): HighlightToken[] {
  const indentMatch = line.match(/^(\s*)/);
  const indent = indentMatch?.[0] ?? "";
  const trimmed = line.slice(indent.length);

  if (trimmed.length === 0) {
    return [{ content: line }];
  }

  if (!trimmed.includes(":")) {
    return [
      { content: indent },
      {
        content: trimmed,
        className: trimmed.startsWith("- ") ? "text-primary" : "text-foreground",
      },
    ];
  }

  const colonIndex = trimmed.indexOf(":");
  const key = trimmed.slice(0, colonIndex);
  const value = trimmed.slice(colonIndex + 1);
  const valueTrimmed = value.trim();

  let valueClassName = "text-foreground";
  if (valueTrimmed === "true" || valueTrimmed === "false") {
    valueClassName = "text-emerald-400";
  } else if (valueTrimmed.startsWith("[") && valueTrimmed.endsWith("]")) {
    valueClassName = "text-sky-300";
  } else if (valueTrimmed.startsWith("/")) {
    valueClassName = "text-amber-300";
  } else if (valueTrimmed.length > 0) {
    valueClassName = "text-zinc-100";
  }

  return [
    { content: indent },
    { content: key, className: key.startsWith("- ") ? "text-primary" : "text-primary" },
    { content: ":", className: "text-muted-foreground" },
    { content: value, className: valueTrimmed.length > 0 ? valueClassName : undefined },
  ];
}

function highlightBashLine(line: string): HighlightToken[] {
  if (line.length === 0) {
    return [{ content: line }];
  }

  if (line.startsWith("$ ")) {
    return [
      { content: "$ ", className: "text-primary" },
      { content: line.slice(2), className: "text-zinc-100" },
    ];
  }

  return [{ content: line, className: "text-muted-foreground" }];
}

export function renderHighlightedCode(code: string, language?: string): ReactNode[] | null {
  const normalizedLanguage = language?.toLowerCase();
  if (normalizedLanguage !== "yaml" && normalizedLanguage !== "bash") {
    return null;
  }

  const lines = code.split("\n");
  return lines.map((line, index) => {
    const tokens =
      normalizedLanguage === "yaml" ? highlightYamlLine(line) : highlightBashLine(line);

    return (
      <span key={`line-${index}`} className="block">
        {renderTokens(tokens, `line-${index}`)}
        {index < lines.length - 1 ? "\n" : ""}
      </span>
    );
  });
}
