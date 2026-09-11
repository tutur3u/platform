export type AnswerSection = { key: string; content: string };

function readable(value: unknown, depth = 0): string {
  if (value === null) return '—';
  if (typeof value !== 'object') return String(value);
  if (depth > 6) return JSON.stringify(value, null, 2);
  if (Array.isArray(value))
    return value.map((item) => `- ${readable(item, depth + 1)}`).join('\n');
  return Object.entries(value)
    .map(
      ([key, item]) => `**${sectionTitle(key)}:** ${readable(item, depth + 1)}`
    )
    .join('\n\n');
}

export function sectionTitle(key: string) {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Preserve plain prose and malformed JSON verbatim; never discard the answer.
export function answerSections(answer: string): AnswerSection[] | null {
  try {
    const value = JSON.parse(
      answer
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
    );
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    const entries = Object.entries(value);
    if (!entries.length) return null;
    return entries.map(([key, content]) => ({
      key,
      content: readable(content),
    }));
  } catch {
    return null;
  }
}
