export function unescapeMarkdownString(str: string | null): string {
  if (!str) return '';

  const escapeMap: Record<string, string> = {
    '\\n': '\n',
    '\\"': '"',
    '\\t': '\t',
    '\\r': '\r',
    '\\\\': '\\',
    "\\'": "'",
  };

  return Object.entries(escapeMap).reduce(
    (acc, [escaped, unescaped]) =>
      acc.replace(new RegExp(escaped, 'g'), unescaped),
    str
  );
}

export function formatHTML(html: string | null): string {
  if (!html) return '';

  const indent = (level: number) => '  '.repeat(level);
  let formatted = '';
  let depth = 0;
  let inContent = false;

  for (let i = 0; i < html.length; i++) {
    const char = html[i];

    if (char === '<' && html[i + 1] !== '/') {
      if (inContent) {
        formatted += '\n' + indent(depth);
        inContent = false;
      }
      depth++;
      formatted += '\n' + indent(depth - 1) + char;
    } else if (char === '<' && html[i + 1] === '/') {
      depth--;
      formatted += '\n' + indent(depth) + char;
    } else if (char === '>') {
      formatted += char;
      if (html[i + 1] && html[i + 1] !== '<') {
        inContent = true;
      }
    } else {
      formatted += char;
    }
  }

  return formatted.trim();
}
