import { z } from 'zod';

export const artifactKindSchema = z.enum([
  'tasks',
  'calendar',
  'finance',
  'meetings',
]);
export const artifactLayoutSchema = z.enum([
  'auto',
  'horizontal',
  'vertical',
  'grid',
]);
export const artifactPresentationSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(240).optional(),
  highlights: z.array(z.string().trim().min(1).max(160)).max(3).optional(),
  search: z.string().trim().max(120).optional(),
  taskStatus: z.enum(['all', 'overdue', 'today', 'upcoming']).optional(),
  currency: z
    .string()
    .trim()
    .max(8)
    .toUpperCase()
    .optional()
    .describe('Finance only: ISO currency code'),
  date: z.iso
    .date()
    .optional()
    .describe('Calendar only: start the seven-day view on this local date'),
  itemIds: z.array(z.string().min(1).max(80)).max(50).optional(),
});
export type ArtifactPresentation = z.infer<typeof artifactPresentationSchema>;
export const showWorkspaceArtifactSchema = z.object({
  kind: artifactKindSchema,
  layout: artifactLayoutSchema.optional(),
  presentation: artifactPresentationSchema.optional(),
});
export const manageWorkspaceSchema = z
  .object({
    operation: z.enum([
      'close_artifact',
      'close_all',
      'focus_artifact',
      'set_layout',
    ]),
    kind: artifactKindSchema.optional(),
    layout: artifactLayoutSchema.optional(),
  })
  .refine(
    (value) =>
      value.operation === 'close_all' ||
      (value.operation === 'set_layout' ? !!value.layout : !!value.kind),
    {
      message: 'Provide kind for artifact operations or layout for set_layout.',
    }
  );
