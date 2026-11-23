import {
  toSafeUpskiiUrl,
  UPSKII_ORIGIN,
} from '@tuturuuu/realtime/meet/room-upskii-presentation';
import { z } from 'zod';
import { getInternalApiClient, type InternalApiClientOptions } from './client';
import { InternalApiError } from './internal-api-error';

export const UPSKII_CONTENT_PATH = '/api/v1/integrations/upskii/content';

export const UPSKII_CONTENT_KINDS = [
  'classes',
  'lessons',
  'assessments',
] as const;
export type UpskiiContentKind = (typeof UPSKII_CONTENT_KINDS)[number];

const ITEM_KIND = {
  classes: 'class',
  lessons: 'lesson',
  assessments: 'assessment',
} as const satisfies Record<UpskiiContentKind, string>;
export type UpskiiContentItemKind = (typeof ITEM_KIND)[UpskiiContentKind];

export type UpskiiContentItem = {
  id: string;
  title: string;
  kind: UpskiiContentItemKind;
  /** Always `https` on the pinned Upskii origin. */
  url: string;
  updatedAt: string | null;
  classId: string | null;
};

export type UpskiiContentPage = {
  items: UpskiiContentItem[];
  nextCursor: string | null;
};

/** Refusals the content route names; anything else is `UNAVAILABLE`. */
export type UpskiiContentErrorCode =
  | 'NOT_LINKED'
  | 'EARLY_ACCESS_ONLY'
  | 'SCOPE_NOT_GRANTED'
  | 'CLASS_NOT_FOUND'
  /** `UPSKII_UNAVAILABLE` and every failure the route does not name. */
  | 'UNAVAILABLE';

const KNOWN_ERRORS = new Set<UpskiiContentErrorCode>([
  'NOT_LINKED',
  'EARLY_ACCESS_ONLY',
  'SCOPE_NOT_GRANTED',
  'CLASS_NOT_FOUND',
]);

export const UPSKII_CONTENT_MAX_ITEMS = 100;

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const controlCharacters =
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;

const rawItemSchema = z.object({
  id: idSchema,
  title: z.string(),
  url: z.unknown(),
  updatedAt: z.string().max(64).nullish(),
  classId: idSchema.nullish(),
});

const rawPageSchema = z.object({
  items: z.array(z.unknown()).max(1000),
  nextCursor: z.string().max(512).nullish(),
});

function cleanTitle(value: string) {
  const title = value.replace(controlCharacters, ' ').trim().slice(0, 160);
  return title || null;
}

/**
 * Keeps only well-formed items whose link is `https` on exactly the Upskii
 * origin. Unsafe links, malformed ids, empty titles and repeats are dropped,
 * never repaired, so Meet cannot open or share another site.
 */
export function parseUpskiiContentPage(
  raw: unknown,
  kind: UpskiiContentKind,
  origin: string = UPSKII_ORIGIN
): UpskiiContentPage {
  const page = rawPageSchema.safeParse(raw);
  if (!page.success) throw new InternalApiError('Invalid Upskii content', 502);
  const seen = new Set<string>();
  const items: UpskiiContentItem[] = [];
  for (const entry of page.data.items) {
    if (items.length >= UPSKII_CONTENT_MAX_ITEMS) break;
    const parsed = rawItemSchema.safeParse(entry);
    if (!parsed.success || seen.has(parsed.data.id)) continue;
    const url = toSafeUpskiiUrl(parsed.data.url, origin);
    const title = cleanTitle(parsed.data.title);
    if (!url || !title) continue;
    seen.add(parsed.data.id);
    items.push({
      id: parsed.data.id,
      title,
      kind: ITEM_KIND[kind],
      url,
      updatedAt: parsed.data.updatedAt ?? null,
      classId: parsed.data.classId ?? null,
    });
  }
  return { items, nextCursor: page.data.nextCursor ?? null };
}

export function upskiiContentErrorCode(error: unknown): UpskiiContentErrorCode {
  if (error instanceof InternalApiError) {
    const code = error.code as UpskiiContentErrorCode | undefined;
    if (code && KNOWN_ERRORS.has(code)) return code;
    if (error.status === 404 && !code) return 'NOT_LINKED';
  }
  return 'UNAVAILABLE';
}

/**
 * The signed-in user's Upskii classes, or one class's lessons or assessments.
 * The route reads through the session user's own link; it takes no user or
 * link id, and no token or Upskii credential ever reaches the client.
 */
export async function listUpskiiContent(
  {
    kind,
    classId,
    cursor,
  }: { kind: UpskiiContentKind; classId?: string; cursor?: string | null },
  options?: InternalApiClientOptions
): Promise<UpskiiContentPage> {
  if (kind !== 'classes' && !idSchema.safeParse(classId).success)
    throw new InternalApiError('A class is required', 400, 'CLASS_REQUIRED');
  const client = getInternalApiClient(options);
  const raw = await client.json<unknown>(UPSKII_CONTENT_PATH, {
    cache: 'no-store',
    query: {
      kind,
      classId: kind === 'classes' ? undefined : classId,
      cursor: cursor || undefined,
    },
  });
  return parseUpskiiContentPage(raw, kind);
}
