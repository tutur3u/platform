import { z } from 'zod';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export const journalTimezoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Invalid timezone');
export const journalMoodSchema = z.enum([
  'very_low',
  'low',
  'neutral',
  'good',
  'great',
]);
export const journalDocumentSchema = z
  .object({
    title: z.string().max(200),
    body: z.string().min(1).max(20000),
    occurredAt: z.iso.datetime({ precision: 3 }),
    timezone: journalTimezoneSchema,
    mood: journalMoodSchema.nullable(),
    moodContext: z.string().max(2000),
    domain: z.enum(['life', 'work']),
    category: z.enum(['reflection', 'good', 'challenge', 'milestone']),
  })
  .strict();
export const journalEntrySchema = journalDocumentSchema
  .extend({
    id: z.guid(),
    actorId: z.guid(),
    workspaceId: z.guid(),
    revision: z.number().int().positive(),
    createdAt: z.iso.datetime({ precision: 3 }),
    updatedAt: z.iso.datetime({ precision: 3 }),
  })
  .strict();
export const journalCreateSchema = z
  .object({ id: z.guid(), document: journalDocumentSchema })
  .strict();
export const journalUpdateSchema = z
  .object({
    operationId: z.guid(),
    expectedRevision: z.number().int().positive(),
    document: journalDocumentSchema,
  })
  .strict();
export const journalListSchema = z
  .object({
    items: z.array(journalEntrySchema).max(100),
    nextBefore: z.guid().nullable(),
  })
  .strict();
export type JournalDocument = z.infer<typeof journalDocumentSchema>;
export type JournalEntry = z.infer<typeof journalEntrySchema>;
export type JournalCreate = z.infer<typeof journalCreateSchema>;
export type JournalUpdate = z.infer<typeof journalUpdateSchema>;
export type JournalPeriod = 'day' | 'week' | 'month' | 'year';

function path(wsId: string, id?: string) {
  const base = `/api/v1/workspaces/${encodePathSegment(wsId)}/personal-journal`;
  return id ? `${base}/${encodePathSegment(id)}` : base;
}
export async function listPersonalJournal(
  wsId: string,
  before?: string,
  options?: InternalApiClientOptions
) {
  const value = await getInternalApiClient(options).json<unknown>(path(wsId), {
    cache: 'no-store',
    query: { before },
  });
  return journalListSchema.parse(value);
}
export async function readPersonalJournal(
  wsId: string,
  id: string,
  options?: InternalApiClientOptions
) {
  const entryId = z.guid().parse(id);
  const value = await getInternalApiClient(options).json<unknown>(
    path(wsId, entryId),
    { cache: 'no-store' }
  );
  const entry = journalEntrySchema.parse(value);
  if (entry.id !== entryId) throw new Error('Journal source mismatch');
  return entry;
}
export async function createPersonalJournal(
  wsId: string,
  input: JournalCreate,
  options?: InternalApiClientOptions
) {
  const value = await getInternalApiClient(options).json<unknown>(path(wsId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(journalCreateSchema.parse(input)),
  });
  return journalEntrySchema.parse(value);
}
export async function updatePersonalJournal(
  wsId: string,
  id: string,
  input: JournalUpdate,
  options?: InternalApiClientOptions
) {
  const value = await getInternalApiClient(options).json<unknown>(
    path(wsId, z.guid().parse(id)),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(journalUpdateSchema.parse(input)),
    }
  );
  return journalEntrySchema.parse(value);
}

export function journalPeriodKey(
  instant: string,
  timezone: string,
  period: JournalPeriod
): string {
  journalTimezoneSchema.parse(timezone);
  z.iso.datetime({ precision: 3 }).parse(instant);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (name: string) =>
    parts.find((part) => part.type === name)?.value ?? '';
  const day = `${get('year')}-${get('month')}-${get('day')}`;
  if (period === 'year') return day.slice(0, 4);
  if (period === 'month') return day.slice(0, 7);
  if (period === 'day') return day;
  const calendarDay = new Date(`${day}T00:00:00Z`);
  calendarDay.setUTCDate(
    calendarDay.getUTCDate() - ((calendarDay.getUTCDay() + 6) % 7)
  );
  return calendarDay.toISOString().slice(0, 10);
}

export function journalDocumentFromEntry(entry: JournalEntry): JournalDocument {
  return journalDocumentSchema.strip().parse(entry);
}
export const journalSourceReferenceSchema = z
  .object({
    kind: z.literal('journal'),
    actorId: z.guid(),
    personalWorkspaceId: z.guid(),
    sourceId: z.guid(),
    sourceVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    observedAt: z.iso.datetime({ precision: 3 }),
    expiresAt: z.iso.datetime({ precision: 3 }),
    deletionVersion: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER),
    revocationVersion: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER),
    consentVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict()
  .refine(
    (value) => value.expiresAt > value.observedAt,
    'Expired reference interval'
  );
export type JournalSourceReference = z.infer<
  typeof journalSourceReferenceSchema
>;
export function parseJournalSourceReference(
  value: unknown
): JournalSourceReference {
  return journalSourceReferenceSchema.parse(value);
}
