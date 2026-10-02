import { z } from 'zod';

export const wikiKinds = [
  'page',
  'character',
  'location',
  'lore',
  'story',
  'world',
  'event',
  'role',
  'organization',
] as const;
export const relationshipKinds = [
  'related',
  'family',
  'friend',
  'rival',
  'member',
  'located',
  'part',
  'role',
  'appears',
] as const;
export const wikiSchema = z
  .object({
    aliases: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
    facts: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(80),
          value: z.string().max(1000),
        })
      )
      .max(40)
      .default([]),
    chronology: z
      .object({
        order: z.number().finite().min(-1e12).max(1e12),
        label: z.string().trim().min(1).max(100),
        era: z.string().max(100).default(''),
      })
      .optional(),
    relationships: z
      .array(
        z.object({
          targetId: z.guid(),
          kind: z.enum(relationshipKinds),
          label: z.string().max(160).default(''),
        })
      )
      .max(100)
      .default([]),
  })
  .superRefine((wiki, ctx) => {
    const keys = wiki.relationships.map((r) => `${r.targetId}:${r.kind}`);
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({
        code: 'custom',
        path: ['relationships'],
        message: 'Duplicate relationship',
      });
  });
