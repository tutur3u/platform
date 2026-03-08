export function stripMarkdownToText(value: string) {
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

export function normalizeMarkdownToText(value: string | null | undefined) {
  return stripMarkdownToText(value ?? '');
}

export function normalizeMarkdownForComparison(
  value: string | null | undefined
) {
  return normalizeMarkdownToText(value).toLowerCase();
}
