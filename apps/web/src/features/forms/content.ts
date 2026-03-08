export function stripMarkdownToText(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`{3}[\s\S]*?`{3}/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_~]+/g, '')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function containsRichTextHtml(
  value: string | null | undefined
): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value ?? '');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyInlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(
      /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g,
      (_match, alt: string, src: string) => `<img src="${src}" alt="${alt}" />`
    )
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g,
      (_match, label: string, href: string) =>
        `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
    )
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_]+)_(?!_)/g, '$1<em>$2</em>');
}

function convertMarkdownBlockToHtml(block: string): string {
  const lines = block
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return '';
  }

  if (lines.length === 1 && /^(-{3,}|\*{3,}|_{3,})$/.test(lines[0] ?? '')) {
    return '<hr />';
  }

  if (lines.length === 1) {
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(lines[0] ?? '');
    if (headingMatch?.[1] && headingMatch[2]) {
      const level = headingMatch[1].length;
      return `<h${level}>${applyInlineMarkdown(headingMatch[2])}</h${level}>`;
    }
  }

  if (lines.every((line) => /^\s*>\s?/.test(line))) {
    const quoteBody = lines
      .map((line) => line.replace(/^\s*>\s?/, ''))
      .join('\n');
    return `<blockquote>${markdownToRichTextHtml(quoteBody)}</blockquote>`;
  }

  if (lines.every((line) => /^\s*[-*+]\s+/.test(line))) {
    const items = lines
      .map((line) => line.replace(/^\s*[-*+]\s+/, ''))
      .map((line) => `<li>${applyInlineMarkdown(line)}</li>`)
      .join('');
    return `<ul>${items}</ul>`;
  }

  if (lines.every((line) => /^\s*\d+\.\s+/.test(line))) {
    const items = lines
      .map((line) => line.replace(/^\s*\d+\.\s+/, ''))
      .map((line) => `<li>${applyInlineMarkdown(line)}</li>`)
      .join('');
    return `<ol>${items}</ol>`;
  }

  return `<p>${lines.map((line) => applyInlineMarkdown(line)).join('<br />')}</p>`;
}

export function markdownToRichTextHtml(
  value: string | null | undefined
): string {
  const normalized = (value ?? '').trim();

  if (!normalized) {
    return '';
  }

  if (containsRichTextHtml(normalized)) {
    return normalized;
  }

  return normalized
    .split(/\n\s*\n/g)
    .map((block) => convertMarkdownBlockToHtml(block))
    .filter(Boolean)
    .join('');
}

export function normalizeMarkdownToText(
  value: string | null | undefined
): string {
  return stripMarkdownToText(value ?? '');
}

export function normalizeMarkdownForComparison(
  value: string | null | undefined
): string {
  return normalizeMarkdownToText(value).toLowerCase();
}
