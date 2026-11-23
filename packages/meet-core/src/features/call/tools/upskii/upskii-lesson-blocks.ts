import { toSafeUpskiiUrl } from '@tuturuuu/realtime/meet/room-upskii-presentation';
import { z } from 'zod';

/**
 * A lesson body as plain, typed blocks. Upskii has no body read yet; this is
 * the shape Meet accepts once it does. Text is rendered as text, never HTML,
 * and an image whose source is not on the pinned Upskii origin is dropped.
 */
export type UpskiiLessonBlock =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'image'; src: string; alt: string };

export const UPSKII_LESSON_LIMITS = {
  blocks: 200,
  text: 4000,
  listItems: 50,
  totalChars: 64_000,
} as const;

const text = (max: number) => z.string().trim().min(1).max(max);
const rawBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('heading'),
    level: z.union([z.literal(2), z.literal(3)]),
    text: text(200),
  }),
  z.object({
    type: z.literal('paragraph'),
    text: text(UPSKII_LESSON_LIMITS.text),
  }),
  z.object({
    type: z.literal('list'),
    ordered: z.boolean(),
    items: z.array(text(500)).min(1).max(UPSKII_LESSON_LIMITS.listItems),
  }),
  z.object({
    type: z.literal('image'),
    src: z.string().max(2048),
    alt: z.string().trim().max(300),
  }),
]);

/** Keeps the valid blocks in order, within the size limits. */
export function sanitizeUpskiiLessonBlocks(raw: unknown): UpskiiLessonBlock[] {
  if (!Array.isArray(raw)) return [];
  const blocks: UpskiiLessonBlock[] = [];
  let chars = 0;
  for (const entry of raw.slice(0, UPSKII_LESSON_LIMITS.blocks)) {
    const parsed = rawBlockSchema.safeParse(entry);
    if (!parsed.success) continue;
    const block = parsed.data;
    if (block.type === 'image') {
      const src = toSafeUpskiiUrl(block.src);
      if (!src) continue;
      blocks.push({ type: 'image', src, alt: block.alt });
      continue;
    }
    const size =
      block.type === 'list'
        ? block.items.reduce((sum, item) => sum + item.length, 0)
        : block.text.length;
    if (chars + size > UPSKII_LESSON_LIMITS.totalChars) break;
    chars += size;
    blocks.push(block);
  }
  return blocks;
}
