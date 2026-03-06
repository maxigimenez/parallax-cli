function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function applyInlineMarkdown(line: string): string {
  const withLinks = line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, url: string) => {
    const safeUrl = escapeHtml(url);
    const safeLabel = escapeHtml(label);

    return `<a href="${safeUrl}" target="_blank" rel="noreferrer" class="text-white underline decoration-white/40 underline-offset-4 hover:decoration-white/70">${safeLabel}</a>`;
  });

  const withCode = withLinks.replace(/`([^`]+)`/g, (_match, code: string) => {
    return `<code class="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.88em] text-white">${escapeHtml(code)}</code>`;
  });

  return withCode.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

export function markdownToHtml(markdown: string): string {
  const blocks: string[] = [];
  let listMode: 'ul' | 'ol' | null = null;

  const closeList = () => {
    if (listMode) {
      blocks.push(`</${listMode}>`);
      listMode = null;
    }
  };

  const codeFenceStore: string[] = [];
  const fenced = markdown.replace(/```(\w+)?\n([\s\S]*?)```/g, (_match, language: string, code: string) => {
    const index = codeFenceStore.length;
    const lang = language ? `<span class="text-white/70">${escapeHtml(language)}</span>` : '';

    codeFenceStore.push(
      `<div class="my-6 overflow-hidden rounded-lg border border-white/15 bg-black/60">` +
        `<div class="flex items-center justify-between border-b border-white/10 px-3 py-2 text-xs text-muted-foreground">` +
        `<span>terminal</span>${lang}</div>` +
        `<pre class="overflow-x-auto p-4 text-sm leading-6 text-slate-100"><code>${escapeHtml(code.trimEnd())}</code></pre></div>`
    );

    return `@@CODEBLOCK_${index}@@`;
  });

  for (const rawLine of fenced.split('\n')) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      closeList();
      continue;
    }

    if (trimmed.startsWith('@@CODEBLOCK_')) {
      closeList();
      blocks.push(trimmed);
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      const text = applyInlineMarkdown(headingMatch[2]);
      const tag = `h${level}`;
      const headingClass =
        level === 1
          ? 'mt-10 text-3xl font-semibold tracking-tight'
          : level === 2
            ? 'mt-9 text-2xl font-semibold tracking-tight'
            : 'mt-7 text-xl font-semibold tracking-tight';
      blocks.push(`<${tag} class="${headingClass}">${text}</${tag}>`);
      continue;
    }

    const unorderedMatch = trimmed.match(/^-\s+(.+)$/);
    if (unorderedMatch) {
      if (listMode !== 'ul') {
        closeList();
        listMode = 'ul';
        blocks.push('<ul class="my-4 list-disc space-y-2 pl-6 text-[0.98rem] leading-7 text-slate-200">');
      }
      blocks.push(`<li>${applyInlineMarkdown(unorderedMatch[1])}</li>`);
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      if (listMode !== 'ol') {
        closeList();
        listMode = 'ol';
        blocks.push('<ol class="my-4 list-decimal space-y-2 pl-6 text-[0.98rem] leading-7 text-slate-200">');
      }
      blocks.push(`<li>${applyInlineMarkdown(orderedMatch[1])}</li>`);
      continue;
    }

    closeList();
    blocks.push(`<p class="mt-4 text-[1.02rem] leading-7 text-slate-200">${applyInlineMarkdown(trimmed)}</p>`);
  }

  closeList();

  return blocks
    .join('\n')
    .replace(/@@CODEBLOCK_(\d+)@@/g, (_match, rawIndex: string) => codeFenceStore[Number(rawIndex)] ?? '');
}
