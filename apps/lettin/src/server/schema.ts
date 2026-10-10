import { z } from 'zod';
import { collaborationPreferences } from '../creation-guidance';
import { workProgressOptions } from '../work-progress';

const id = z.guid();
const version = z.number().int().positive();

import { artworkGallerySchema, artworkImageSchema } from './artwork-schema';
import { richTextNodeSchema } from './rich-text-schema';
import { wikiKinds, wikiSchema } from './wiki-schema';

export const lettinDraftSchema = z.object({
  workProgress: z.enum(workProgressOptions).optional(),
  creationGuidance: z
    .object({
      credits: z.string().trim().max(1000),
      usageNotes: z.string().trim().max(1000),
      collaboration: z.enum(collaborationPreferences),
    })
    .optional(),
  contentNotice: z.string().trim().max(500).optional(),
  theme: z
    .object({
      palette: z.enum(['paper', 'forest', 'midnight', 'rose']),
      typography: z.enum(['editorial', 'clean']),
      motion: z.enum(['full', 'reduced']),
    })
    .optional(),
  title: z.string().trim().min(1).max(160),
  description: z.string().max(2000),
  image: artworkImageSchema,
  gallery: artworkGallerySchema.optional(),
  credit: z.string().max(200),
  kind: z.enum(wikiKinds),
  wiki: wikiSchema.optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  links: z.array(id).max(100),
  content: richTextNodeSchema.refine((root) => {
    let count = 0;
    const visit = (node: typeof root) => {
      if (['image', 'imageResize'].includes(node.type)) count++;
      node.content?.forEach(visit);
    };
    visit(root);
    return root.type === 'doc' && count <= 30;
  }, 'Documents require a document root and allow at most 30 images'),
});
export const lettinCommandSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('createWorld'),
    draft: lettinDraftSchema.extend({
      links: z.array(id).length(0),
      wiki: wikiSchema
        .refine((wiki) => wiki.relationships.length === 0)
        .optional(),
    }),
  }),
  z.object({
    action: z.literal('createEntry'),
    worldId: id,
    draft: lettinDraftSchema.extend({
      links: z.array(id).length(0),
      wiki: wikiSchema
        .refine((wiki) => wiki.relationships.length === 0)
        .optional(),
    }),
  }),
  z.object({
    action: z.literal('duplicateEntry'),
    worldId: id,
    entryId: id,
    version,
    title: z.string().trim().min(1).max(160),
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
