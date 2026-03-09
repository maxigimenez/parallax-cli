interface TerminalBlockProps {
  lines: { number: number; content: React.ReactNode; isCommand?: boolean }[];
  title?: string;
}

const TerminalBlock = ({ lines, title }: TerminalBlockProps) => {
  return (
    <div className="terminal-window border-glow">
      <div className="terminal-header">
        <div className="terminal-dot bg-destructive" />
        <div className="terminal-dot bg-primary" />
        <div className="terminal-dot bg-terminal-green" />
        {title && (
          <span className="ml-2 text-xs text-muted-foreground">{title}</span>
        )}
      </div>
      <div className="p-6 font-mono text-sm leading-relaxed">
        {lines.map((line) => (
          <div key={line.number} className="flex">
            <span className="line-number">{line.number}</span>
            <span className={line.isCommand ? "text-foreground font-medium" : "text-muted-foreground"}>
              {line.content}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TerminalBlock;
