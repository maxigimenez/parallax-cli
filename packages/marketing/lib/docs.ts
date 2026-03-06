import fs from 'node:fs';
import path from 'node:path';

export type DocItem = {
  slug: string;
  file: string;
  title: string;
  description: string;
  markdown: string;
};

function resolveDocsDir(): string {
  const candidates = [
    path.resolve(process.cwd(), '../../docs'),
    path.resolve(process.cwd(), '../docs'),
    path.resolve(process.cwd(), 'docs')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('Could not locate docs directory from marketing package.');
}

const DOCS_DIR = resolveDocsDir();

function toSlug(fileName: string): string {
  return fileName.replace(/\.md$/i, '').toLowerCase();
}

function parseTitle(markdown: string, slug: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m);
  if (heading) {
    return heading[1].trim();
  }

  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parseDescription(markdown: string): string {
  const lines = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('#'));

  return lines[0]?.slice(0, 170) ?? 'Parallax documentation.';
}

export function getAllDocs(): DocItem[] {
  const entries = fs
    .readdirSync(DOCS_DIR)
    .filter((file) => file.endsWith('.md'))
    .sort((a, b) => {
      if (a === 'README.md') {
        return -1;
      }
      if (b === 'README.md') {
        return 1;
      }
      return a.localeCompare(b);
    });

  return entries.map((file) => {
    const markdown = fs.readFileSync(path.join(DOCS_DIR, file), 'utf8');
    const slug = toSlug(file);

    return {
      slug,
      file,
      title: parseTitle(markdown, slug),
      description: parseDescription(markdown),
      markdown
    };
  });
}

export function getDocBySlug(slug: string): DocItem | null {
  return getAllDocs().find((doc) => doc.slug === slug) ?? null;
}
