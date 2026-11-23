import { createHash } from 'node:crypto';
import { verifyRealtimePayload } from '@tuturuuu/realtime/core/token';
import { checkBoardOpen } from '@tuturuuu/realtime/meet/board-sync-access';
import { canonicalScene } from '@tuturuuu/realtime/meet/board-sync-merge';
import {
  BOARD_LIMITS,
  BOARD_TICKET_AUDIENCE,
  type BoardElement,
  boardCheckpointRequestSchema,
  boardElementSchema,
  boardTicketSchema,
  byteLength,
} from '@tuturuuu/realtime/meet/board-sync-schema';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { noStore } from '../../route-utils';

const MAX_BODY_BYTES = 3_000_000;
type Row = Record<string, any>;
type Db = Awaited<ReturnType<typeof createAdminClient>>;

const respond = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: noStore });
const fail = (status: number) =>
  new NextResponse(null, { status, headers: noStore });
const sha256 = (text: string) =>
  createHash('sha256').update(text).digest('hex');

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return 'too-large' as const;
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

/** Splits a stored snapshot into elements the room can edit and ones it must preserve. */
/** Whether the room's copy supersedes a stored one: higher version, then lower nonce. */
function roomIsNewer(room: BoardElement, stored: Row) {
  const version = typeof stored.version === 'number' ? stored.version : -1;
  const nonce =
    typeof stored.versionNonce === 'number' ? stored.versionNonce : 0;
  return (
    room.version > version ||
    (room.version === version && room.versionNonce < nonce)
  );
}

function splitStored(snapshot: unknown) {
  const parsed =
    typeof snapshot === 'string'
      ? (() => {
          try {
            return JSON.parse(snapshot);
          } catch {
            return null;
          }
        })()
      : snapshot;
  const elements: unknown[] = Array.isArray(parsed?.elements)
    ? parsed.elements
    : [];
  const supported: BoardElement[] = [];
  const preserved: unknown[] = [];
  let bytes = 0;
  for (const element of elements) {
    const checked = boardElementSchema.safeParse(element);
    if (!checked.success) {
      preserved.push(element);
      continue;
    }
    const size = byteLength(checked.data);
    // Elements past the room's budgets are never loaded into the room and are
    // written back untouched, so a large board is saved, never trimmed.
    if (
      supported.length >= BOARD_LIMITS.maxElements ||
      bytes + size > BOARD_LIMITS.maxSnapshotBytes
    ) {
      preserved.push(element);
      continue;
    }
    supported.push(checked.data);
    bytes += size;
  }
  return {
    supported,
    preserved,
    appState: (parsed?.appState ?? {}) as Row,
  };
}

async function readFacts(db: Db, meetingId: string, boardId: string) {
  const client = db as unknown as { schema(name: string): Db };
  const [meeting, link, board] = await Promise.all([
    db
      .from('workspace_meetings')
      .select('ws_id')
      .eq('id', meetingId)
      .maybeSingle(),
    client
      .schema('private')
      .from('meet_whiteboards' as never)
      .select('ws_id, guest_access')
      .eq('meeting_id' as never, meetingId)
      .eq('whiteboard_id' as never, boardId)
      .maybeSingle(),
    db
      .from('workspace_whiteboards')
      .select('ws_id, archived_at, updated_at, snapshot')
      .eq('id', boardId)
      .maybeSingle(),
  ]);
  if (meeting.error || link.error || board.error)
    throw new Error('lookup failed');
  return {
    meetingWsId: (meeting.data as Row | null)?.ws_id as string | undefined,
    link: link.data as Row | null,
    board: board.data as Row | null,
  };
}

/**
 * Loads and flushes a Meet whiteboard for its room. Every call rechecks the
 * link, the archive state and the workspace; a flush compares and sets on
 * `updated_at` and treats a replay of identical content as success.
 */
export async function POST(request: Request) {
  const raw = request.headers
    .get('Authorization')
    ?.match(/^Bearer (\S+)$/)?.[1];
  const ticket = boardTicketSchema.safeParse(
    verifyRealtimePayload(raw ?? '', process.env.MEET_REALTIME_TOKEN_SECRET)
  );
  if (
    !ticket.success ||
    ticket.data.aud !== BOARD_TICKET_AUDIENCE ||
    ticket.data.kind !== 'checkpoint' ||
    ticket.data.actorKind !== 'system' ||
    ticket.data.exp * 1000 <= Date.now()
  )
    return fail(401);
  try {
    const raw = await readBody(request);
    if (raw === 'too-large') return fail(413);
    const body = boardCheckpointRequestSchema.safeParse(raw);
    if (!body.success) return fail(400);
    const db = await createAdminClient({ noCookie: true });
    const { meetingId, boardId, wsId } = ticket.data;

    const read = async () => {
      const facts = await readFacts(db, meetingId, boardId);
      const open =
        facts.meetingWsId === wsId
          ? checkBoardOpen({
              link: facts.link as never,
              board: facts.board as never,
              meetingWsId: wsId,
            })
          : ({ ok: false, reason: 'workspace-mismatch' } as const);
      return { facts, open };
    };
    const first = await read();
    if (!first.open.ok)
      return fail(first.open.reason === 'board-archived' ? 410 : 404);

    const stored = (row: Row) => splitStored(row.snapshot);
    const conflict = (row: Row) => {
      const { supported, preserved } = stored(row);
      return {
        supported,
        updatedAt: String(row.updated_at),
        preservedIds: preserved.flatMap((element) => {
          const id = (element as { id?: unknown })?.id;
          return typeof id === 'string' && id.length <= 64 ? [id] : [];
        }),
      };
    };

    if (body.data.op === 'load') {
      const { supported, updatedAt, preservedIds } = conflict(
        first.facts.board!
      );
      return respond({ updatedAt, elements: supported, preservedIds });
    }

    const flush = body.data;
    if (sha256(canonicalScene(flush.elements as BoardElement[])) !== flush.hash)
      return fail(400);
    const settle = (row: Row) => {
      const { supported, updatedAt, preservedIds } = conflict(row);
      // The same content already stored means an earlier attempt landed.
      return sha256(canonicalScene(supported)) === flush.hash
        ? respond({ updatedAt })
        : respond({ updatedAt, elements: supported, preservedIds }, 409);
    };

    const board = first.facts.board!;
    if (flush.baseUpdatedAt !== String(board.updated_at)) return settle(board);

    const { preserved, appState } = stored(board);
    // The room owns every element it sent, except where the stored copy is one
    // the room cannot hold (it grew past a budget since the room last read it)
    // and the room's copy is not newer: that stored copy is kept as it is.
    const storedPreserved = new Map<string, Row>();
    for (const element of preserved) {
      const id = (element as { id?: unknown })?.id;
      if (typeof id === 'string') storedPreserved.set(id, element as Row);
    }
    const sentElements = flush.elements.filter((element) => {
      const held = storedPreserved.get(element.id);
      return !held || roomIsNewer(element, held);
    });
    const sent = new Set(sentElements.map((element) => element.id));
    const kept = preserved.filter(
      (element) => !sent.has((element as { id?: string })?.id ?? '')
    );
    const snapshot = { elements: [...sentElements, ...kept], appState };
    if (
      byteLength(flush.elements) > BOARD_LIMITS.maxSnapshotBytes ||
      byteLength(snapshot) > BOARD_LIMITS.maxSnapshotBytes * 4
    )
      return fail(413);
    const { data, error } = await db
      .from('workspace_whiteboards')
      .update({ snapshot, updated_at: new Date().toISOString() } as never)
      .eq('id', boardId)
      .eq('ws_id', wsId)
      .eq('updated_at', String(board.updated_at))
      .is('archived_at', null)
      .select('updated_at');
    if (error) throw new Error('write failed');
    if (data?.length === 1)
      return respond({ updatedAt: String(data[0]!.updated_at) });
    // Lost the compare-and-set race: report against what is stored now.
    const again = await read();
    if (!again.open.ok)
      return fail(again.open.reason === 'board-archived' ? 410 : 404);
    return settle(again.facts.board!);
  } catch (error) {
    if (!(error instanceof SyntaxError))
      console.error('Meet whiteboard checkpoint failed', {
        reason: error instanceof Error ? error.message : 'unknown',
      });
    return fail(error instanceof SyntaxError ? 400 : 503);
  }
}
