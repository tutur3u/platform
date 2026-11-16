import { CiteWorkSchema } from '@tuturuuu/cite';
import { z } from 'zod';

export const libraryTagsSchema = z
  .array(z.string().trim().min(1).max(100))
  .max(30)
  .refine((tags) => new TextEncoder().encode(tags.join(',')).byteLength <= 3000)
  .default([]);
export const citationLibraryItemSchema = z.object({
  id: z.uuid().toLowerCase(),
  wsId: z.uuid(),
  ownerUserId: z.uuid().nullable(),
  work: CiteWorkSchema,
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  tags: libraryTagsSchema,
  version: z.number().int().positive().max(2147483647),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const createLibraryItemSchema = z
  .object({
    id: z.uuid().toLowerCase(),
    work: CiteWorkSchema,
    tags: libraryTagsSchema,
  })
  .strict();

export const updateLibraryItemSchema = z
  .object({
    expectedVersion: z.number().int().positive().max(2147483646),
    work: CiteWorkSchema,
    tags: libraryTagsSchema,
  })
  .strict();

export const batchLibraryItemsSchema = z
  .object({
    ids: z
      .array(z.uuid().toLowerCase())
      .min(1)
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict();

export const deleteLibraryItemSchema = z
  .object({
    expectedVersion: z.number().int().positive().max(2147483647),
  })
  .strict();

export const libraryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
    search: z.string().trim().max(200).default(''),
  })
  .strict();

export type CitationLibraryItem = z.infer<typeof citationLibraryItemSchema>;
export type CreateLibraryItem = z.infer<typeof createLibraryItemSchema>;
export type UpdateLibraryItem = z.infer<typeof updateLibraryItemSchema>;
export type LibraryQuery = z.infer<typeof libraryQuerySchema>;
export type CitationLibraryScope = { wsId: string; actorId: string };

export class CitationLibraryError extends Error {
  constructor(
    public readonly code:
      | 'LIBRARY_UNAVAILABLE'
      | 'INVALID_INPUT'
      | 'NOT_FOUND'
      | 'VERSION_CONFLICT'
      | 'DUPLICATE_SOURCE'
      | 'FORBIDDEN',
    public readonly status: 400 | 403 | 404 | 409 | 413 | 503,
    public readonly existingId?: string
  ) {
    super(code);
  }
}

export interface CitationLibraryStore {
  list(wsId: string, query: LibraryQuery): Promise<CitationLibraryItem[]>;
  get(wsId: string, id: string): Promise<CitationLibraryItem | null>;
  getMany(wsId: string, ids: string[]): Promise<CitationLibraryItem[]>;
  findFingerprint(
    wsId: string,
    fingerprint: string
  ): Promise<CitationLibraryItem | null>;
  insert(
    scope: CitationLibraryScope,
    item: CreateLibraryItem & { fingerprint: string }
  ): Promise<CitationLibraryItem>;
  update(
    wsId: string,
    id: string,
    item: UpdateLibraryItem & { fingerprint: string }
  ): Promise<CitationLibraryItem | null>;
  remove(wsId: string, id: string, expectedVersion: number): Promise<boolean>;
}
