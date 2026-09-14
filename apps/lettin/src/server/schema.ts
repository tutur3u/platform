import type { LettinNode } from '@tuturuuu/internal-api/lettin';
import { z } from 'zod';

const id = z.guid();
const version = z.number().int().positive();
// A bounded, deliberately small rich-text vocabulary. No raw HTML, embeds or private mentions.
const node: z.ZodType<LettinNode> = z.lazy(() =>
  z.object({
    type: z.enum([
      'doc',
      'paragraph',
      'text',
      'heading',
      'bulletList',
      'orderedList',
      'listItem',
      'blockquote',
      'hardBreak',
      'horizontalRule',
      'codeBlock',
    ]),
    text: z.string().max(100000).optional(),
    attrs: z
      .object({ level: z.number().int().min(1).max(3).optional() })
      .optional(),
    marks: z
      .array(z.object({ type: z.enum(['bold', 'italic', 'strike', 'code']) }))
      .max(4)
      .optional(),
    content: z.array(node).max(2000).optional(),
  })
);
export const lettinDraftSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(2000),
  image: z.union([
    z.literal(''),
    z.string().regex(/^\/api\/v1\/lettin\/media\/[0-9a-f-]{36}$/),
    z
      .url()
      .max(2000)
      .refine((v) => new URL(v).protocol === 'https:')
      .transform((value) => {
        const url = new URL(value);
        return url.origin === 'https://lettin.tuturuuu.com' &&
          url.pathname.startsWith('/api/v1/lettin/media/')
          ? url.pathname
          : value;
      }),
  ]),
  credit: z.string().max(200),
  kind: z.enum(['page', 'character', 'location', 'lore', 'story']),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  links: z.array(id).max(100),
  content: node,
});
export const lettinCommandSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('createWorld'),
    draft: lettinDraftSchema.extend({ links: z.array(id).length(0) }),
  }),
  z.object({
    action: z.literal('createEntry'),
    worldId: id,
    draft: lettinDraftSchema.extend({ links: z.array(id).length(0) }),
  }),
  z.object({
    action: z.literal('saveWorld'),
    worldId: id,
    version,
    draft: lettinDraftSchema.extend({ links: z.array(id).length(0) }),
  }),
  z.object({
    action: z.literal('saveEntry'),
    worldId: id,
    entryId: id,
    version,
    draft: lettinDraftSchema,
  }),
  ...(['publishWorld', 'unpublishWorld'] as const).map((action) =>
    z.object({ action: z.literal(action), worldId: id, version })
  ),
  ...(['publishEntry', 'unpublishEntry'] as const).map((action) =>
    z.object({ action: z.literal(action), worldId: id, entryId: id, version })
  ),
  z.object({ action: z.literal('invite'), email: z.email().max(320) }),
  ...(['acceptInvitation', 'revokeInvitation'] as const).map((action) =>
    z.object({ action: z.literal(action), invitationId: id })
  ),
  z.object({
    action: z.literal('setCreator'),
    userId: id,
    canInvite: z.boolean(),
    enabled: z.boolean(),
  }),
  z.object({
    action: z.literal('setCollaborator'),
    worldId: id,
    userId: id,
    role: z.enum(['editor', 'publisher']),
  }),
  z.object({
    action: z.literal('removeCollaborator'),
    worldId: id,
    userId: id,
  }),
]);
export function withinLettinDepth(value: unknown, depth = 0): boolean {
  if (depth > 25) return false;
  if (!value || typeof value !== 'object') return true;
  return Object.values(value).every((child) =>
    withinLettinDepth(child, depth + 1)
  );
}
