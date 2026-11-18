import * as encoding from 'lib0/encoding';
import { z } from 'zod';

/**
 * Mira's document identity. Client awareness is rewritten to the socket's
 * authenticated account UUID, so no browser can produce this id.
 */
export const MIRA_DOCUMENT_USER_ID = 'mira';
/** Reserved awareness client; sockets that claim it are refused. */
export const MIRA_AWARENESS_CLIENT_ID = 0x7fff_fff0;
/** Caret renderers need a hex value; the editor surface maps it to tokens. */
export const MIRA_DOCUMENT_COLOR = '#6236b0';
/** Keys only the trusted Mira path may set on an awareness state. */
export const MIRA_RESERVED_AWARENESS_KEYS = ['isMira', 'mira'] as const;

const relativePosition = z
  .record(z.string(), z.unknown())
  .refine((value) => JSON.stringify(value).length <= 512);
export const miraCursorSchema = z
  .object({ anchor: relativePosition, head: relativePosition })
  .strict();
export type MiraCursor = z.infer<typeof miraCursorSchema>;

const miraAwarenessSchema = z.object({
  user: z.object({
    id: z.literal(MIRA_DOCUMENT_USER_ID),
    name: z.string().max(40),
    color: z.string(),
  }),
  mira: z
    .object({
      source: z.enum(['chat', 'live']),
      activeTabId: z.string().max(64),
      statusText: z.string().max(120).optional(),
    })
    .strict(),
});
export type MiraAwareness = z.infer<typeof miraAwarenessSchema>['mira'];

export function miraCaretName(source: 'chat' | 'live') {
  return source === 'live' ? 'Mira • Live' : 'Mira • Chat';
}

/** Accepts only the reserved client with Mira's unforgeable identity. */
export function readMiraAwareness(
  clientId: number,
  state: Record<string, unknown> | null | undefined
): MiraAwareness | null {
  if (clientId !== MIRA_AWARENESS_CLIENT_ID || !state) return null;
  const parsed = miraAwarenessSchema.safeParse(state);
  return parsed.success ? parsed.data.mira : null;
}

function encode(clock: number, state: Record<string, unknown> | null) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 1);
  encoding.writeVarUint(encoder, MIRA_AWARENESS_CLIENT_ID);
  encoding.writeVarUint(encoder, clock);
  encoding.writeVarString(encoder, JSON.stringify(state));
  return encoding.toUint8Array(encoder);
}

/**
 * Builds the awareness frame the server publishes for Mira. The clock is the
 * publish time so later frames always supersede earlier ones in every peer.
 */
export function miraAwarenessUpdate(input: {
  source: 'chat' | 'live';
  activeTabId: string;
  statusText?: string;
  cursor?: MiraCursor | null;
  clock?: number;
}) {
  return encode(input.clock ?? Date.now(), {
    user: {
      id: MIRA_DOCUMENT_USER_ID,
      name: miraCaretName(input.source),
      color: MIRA_DOCUMENT_COLOR,
    },
    mira: {
      source: input.source,
      activeTabId: input.activeTabId,
      ...(input.statusText ? { statusText: input.statusText } : {}),
    },
    ...(input.cursor ? { cursor: input.cursor } : {}),
  });
}

export function miraAwarenessRemoval(clock = Date.now()) {
  return encode(clock, null);
}
