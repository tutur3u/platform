import type { LettinDraft, LettinKind } from '@tuturuuu/internal-api/lettin';
import { entryKinds } from './wiki-model';

export function quickNoteDraft(
  title: string,
  body: string,
  kind: LettinKind = 'page'
): LettinDraft | null {
  const name = title.trim();
  const text = body.trim().replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  if (
    !entryKinds.includes(kind) ||
    !name ||
    name.length > 160 ||
    !text ||
    body.length > 10000 ||
    lines.length > 100
  )
    return null;
  return {
    title: name,
    description: '',
    image: '',
    credit: '',
    kind,
    tags: [],
    links: [],
    content: {
      type: 'doc',
      content: lines.map((line) => ({
        type: 'paragraph',
        content: line ? [{ type: 'text', text: line }] : [],
      })),
    },
  };
}
