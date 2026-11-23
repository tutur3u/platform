import { z } from 'zod';
import type { UpskiiReadScope } from './constants';

export const UPSKII_CONTENT_KINDS = [
  'classes',
  'lessons',
  'assessments',
] as const;
export type UpskiiContentKind = (typeof UPSKII_CONTENT_KINDS)[number];

export const UPSKII_CONTENT_SCOPES: Record<UpskiiContentKind, UpskiiReadScope> =
  {
    assessments: 'upskii:assessments:read',
    classes: 'upskii:classes:read',
    lessons: 'upskii:lessons:read',
  };

const UPSKII_PRODUCTION_ORIGIN = 'https://app.upskii.com';
const MAX_ITEMS = 100;
const MAX_TITLE_LENGTH = 300;
const TIMEOUT_MS = 8000;

/**
 * Upskii's origin, pinned in server configuration and never taken from a
 * request. Production always uses the canonical app host; other runtimes may
 * point `UPSKII_API_ORIGIN` at a local or staging Upskii.
 */
export function upskiiApiOrigin(
  env: Record<string, string | undefined> = process.env
) {
  if (env.NODE_ENV === 'production') return UPSKII_PRODUCTION_ORIGIN;
  try {
    const configured = env.UPSKII_API_ORIGIN
      ? new URL(env.UPSKII_API_ORIGIN)
      : null;
    return configured && ['http:', 'https:'].includes(configured.protocol)
      ? configured.origin
      : UPSKII_PRODUCTION_ORIGIN;
  } catch {
    return UPSKII_PRODUCTION_ORIGIN;
  }
}

export const upskiiClassIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\w-]+$/u);

const itemSchema = z.object({
  classId: z.string().max(128).optional(),
  id: z.string().min(1).max(128),
  kind: z.enum(['assessment', 'class', 'lesson']),
  title: z.string(),
  updatedAt: z.string().max(64),
  url: z.string().max(2048),
});

export type UpskiiContentItem = z.infer<typeof itemSchema>;

/** Keeps only links to Upskii's own origin; anything else is dropped. */
function safeUpskiiUrl(value: string, origin: string) {
  try {
    const url = new URL(value);
    return url.origin === origin && url.username === '' && url.password === ''
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function sanitizeUpskiiItems(
  body: unknown,
  origin: string
): UpskiiContentItem[] | null {
  const parsed = z
    .object({ items: z.array(z.unknown()).max(1000) })
    .safeParse(body);
  if (!parsed.success) return null;
  const items: UpskiiContentItem[] = [];
  for (const raw of parsed.data.items) {
    const item = itemSchema.safeParse(raw);
    if (!item.success) continue;
    const url = safeUpskiiUrl(item.data.url, origin);
    if (!url) continue;
    items.push({
      ...item.data,
      title: item.data.title.slice(0, MAX_TITLE_LENGTH),
      url,
    });
    if (items.length === MAX_ITEMS) break;
  }
  return items;
}

export type UpskiiContentResult =
  | { items: UpskiiContentItem[]; ok: true }
  | {
      code:
        | 'CLASS_NOT_FOUND'
        | 'NOT_LINKED'
        | 'SCOPE_NOT_GRANTED'
        | 'UPSKII_UNAVAILABLE';
      ok: false;
      status: 403 | 404 | 502;
    };

/**
 * Reads one listing from Upskii with a read token minted for this request.
 * Upskii's answer is validated and its links narrowed to Upskii's origin.
 */
export async function fetchUpskiiContent({
  classId,
  fetchImpl = fetch,
  kind,
  origin = upskiiApiOrigin(),
  token,
}: {
  classId: string | null;
  fetchImpl?: typeof fetch;
  kind: UpskiiContentKind;
  origin?: string;
  token: string;
}): Promise<UpskiiContentResult> {
  const url = new URL(`/api/upskii/integrations/tuturuuu/v1/${kind}`, origin);
  if (classId) url.searchParams.set('classId', classId);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      cache: 'no-store',
      headers: { authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { code: 'UPSKII_UNAVAILABLE', ok: false, status: 502 };
  }

  if (response.status === 401) {
    return { code: 'NOT_LINKED', ok: false, status: 404 };
  }
  if (response.status === 403) {
    return { code: 'SCOPE_NOT_GRANTED', ok: false, status: 403 };
  }
  if (response.status === 404) {
    return { code: 'CLASS_NOT_FOUND', ok: false, status: 404 };
  }
  if (!response.ok) {
    return { code: 'UPSKII_UNAVAILABLE', ok: false, status: 502 };
  }

  const items = sanitizeUpskiiItems(
    await response.json().catch(() => null),
    origin
  );
  return items
    ? { items, ok: true }
    : { code: 'UPSKII_UNAVAILABLE', ok: false, status: 502 };
}
