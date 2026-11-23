import 'server-only';
import {
  boardRoleFor,
  checkBoardOpen,
} from '@tuturuuu/realtime/meet/board-sync-access';
import {
  BOARD_LIMITS,
  BOARD_TICKET_AUDIENCE,
  type BoardGuestAccess,
  type BoardTicket,
  boardGuestAccessSchema,
  boardTicketSchema,
} from '@tuturuuu/realtime/meet/board-sync-schema';
import { signRealtimePayload } from '@tuturuuu/realtime/core/token';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  AccountServiceError,
  accountPrivateRpc,
} from '@tuturuuu/utils/account-benefits-server';
import { z } from 'zod';
import { MeetCallAccessError } from '../lib/call-access';
import { channelEndpoint } from './documents';
import { callRoomService, type MeetCallRouteAccess } from './room-service';

type Access = MeetCallRouteAccess;
type Row = Record<string, any>;
type Admin = Awaited<ReturnType<typeof createAdminClient>>;
type LinkRow = {
  whiteboard_id: string;
  ws_id: string;
  guest_access: BoardGuestAccess;
};

const boardId = z.uuid();
const guestAccess = boardGuestAccessSchema;

/** Browser commands. Identity, workspace and role never come from the body. */
export const whiteboardActionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('join'), boardId }),
  z.strictObject({
    action: z.literal('link'),
    boardId,
    guestAccess: guestAccess.optional(),
  }),
  z.strictObject({
    action: z.literal('create'),
    title: z.string().trim().min(1).max(120),
    guestAccess: guestAccess.optional(),
  }),
  z.strictObject({ action: z.literal('unlink'), boardId }),
  z.strictObject({
    action: z.literal('guest-access'),
    boardId,
    guestAccess,
  }),
]);
export type WhiteboardAction = z.infer<typeof whiteboardActionSchema>;

const isGuest = (access: Access) => 'guest' in access && access.guest === true;

/** The room proves lifecycle and admission before any board is shown. */
const proveAdmission = (access: Access) =>
  callRoomService(access, { action: 'programming.read' });

function whiteboardEndpoint() {
  const url = channelEndpoint();
  url.pathname = '/whiteboard';
  return url;
}

async function adminDb() {
  return createAdminClient({ noCookie: true });
}

async function readLinks(db: Admin, meetingId: string): Promise<LinkRow[]> {
  const { data, error } = await (db as unknown as { schema(n: string): any })
    .schema('private')
    .from('meet_whiteboards')
    .select('whiteboard_id, ws_id, guest_access')
    .eq('meeting_id', meetingId);
  if (error) throw new MeetCallAccessError(503, 'Whiteboards are unavailable');
  return (data ?? []) as LinkRow[];
}

async function readBoards(db: Admin, wsId: string, ids: string[]) {
  if (ids.length === 0) return [] as Row[];
  const { data, error } = await db
    .from('workspace_whiteboards')
    .select('id, title, archived_at, updated_at')
    .eq('ws_id', wsId)
    .in('id', ids);
  if (error) throw new MeetCallAccessError(503, 'Whiteboards are unavailable');
  return (data ?? []) as Row[];
}

/** Hosts and workspace admins who are live workspace members manage links. */
async function canManage(access: Access, db: Admin) {
  if (isGuest(access) || !access.canReadWorkspace) return false;
  if (access.isHost) return true;
  const { data, error } = await db.rpc('has_workspace_permission', {
    p_permission: 'admin',
    p_user_id: access.user.id,
    p_ws_id: access.meeting.ws_id,
  });
  if (error) throw new MeetCallAccessError(503, 'Permission unavailable');
  return data === true;
}

const roleOf = (access: Access, level: BoardGuestAccess) =>
  boardRoleFor(
    isGuest(access)
      ? { kind: 'guest' }
      : { kind: 'member', workspaceMember: access.canReadWorkspace },
    level
  );

export async function listMeetingWhiteboards(access: Access) {
  await proveAdmission(access);
  const db = await adminDb();
  const { ws_id: wsId, id: meetingId } = access.meeting;
  const [links, manage] = await Promise.all([
    readLinks(db, meetingId),
    canManage(access, db),
  ]);
  const boards = new Map(
    (
      await readBoards(
        db,
        wsId,
        links.map((link) => link.whiteboard_id)
      )
    ).map((board) => [board.id as string, board])
  );
  const visible = links.flatMap((link) => {
    const board = boards.get(link.whiteboard_id);
    const role = roleOf(access, link.guest_access);
    if (!board || board.archived_at || !role) return [];
    return [
      {
        boardId: link.whiteboard_id,
        title: board.title as string,
        role,
        ...(manage ? { guestAccess: link.guest_access } : {}),
      },
    ];
  });
  let available: { id: string; title: string }[] = [];
  if (manage) {
    const { data, error } = await db
      .from('workspace_whiteboards')
      .select('id, title')
      .eq('ws_id', wsId)
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .limit(50);
    if (error)
      throw new MeetCallAccessError(503, 'Whiteboards are unavailable');
    const linked = new Set(links.map((link) => link.whiteboard_id));
    available = (data ?? []).filter((board) => !linked.has(board.id));
  }
  return { canManage: manage, links: visible, available };
}

export async function joinMeetingWhiteboard(access: Access, id: string) {
  await proveAdmission(access);
  const db = await adminDb();
  const { ws_id: wsId, id: meetingId } = access.meeting;
  const link = (await readLinks(db, meetingId)).find(
    (row) => row.whiteboard_id === id
  );
  const [board] = await readBoards(db, wsId, [id]);
  const open = checkBoardOpen({
    link: link ?? null,
    board: board ? { ws_id: wsId, archived_at: board.archived_at } : null,
    meetingWsId: wsId,
  });
  if (!open.ok || !board)
    throw new MeetCallAccessError(404, 'Whiteboard not found');
  const role = roleOf(access, open.guestAccess);
  if (!role) throw new MeetCallAccessError(403, 'Whiteboard access denied');
  const ticket: BoardTicket = boardTicketSchema.parse({
    aud: BOARD_TICKET_AUDIENCE,
    kind: 'join',
    meetingId,
    wsId,
    boardId: id,
    actorKind: !isGuest(access) && access.canReadWorkspace ? 'member' : 'guest',
    userId: access.user.id,
    displayName: access.displayName,
    role,
    exp: Math.floor(Date.now() / 1000) + BOARD_LIMITS.ticketTtlSeconds,
  });
  return {
    endpoint: whiteboardEndpoint().toString(),
    token: signRealtimePayload(ticket, process.env.MEET_REALTIME_TOKEN_SECRET),
    role,
    refreshSeconds: Math.floor(BOARD_LIMITS.ticketTtlSeconds / 2),
    board: { id, title: board.title as string },
    user: { id: access.user.id, displayName: access.displayName },
  };
}

/** The RPCs enforce host or admin; their refusals map to HTTP statuses. */
async function rpc<T>(name: string, args: Record<string, unknown>) {
  try {
    return await accountPrivateRpc<T>(name, args);
  } catch (error) {
    if (error instanceof AccountServiceError)
      throw new MeetCallAccessError(error.status, 'Whiteboard action failed');
    throw error;
  }
}

function member(access: Access) {
  if (isGuest(access) || !access.canReadWorkspace)
    throw new MeetCallAccessError(403, 'Workspace access required');
  return access;
}

async function link(
  access: Access,
  id: string,
  requested: BoardGuestAccess | undefined
) {
  const actor = member(access).user.id;
  const meetingId = access.meeting.id;
  const row = await rpc<Row>('link_meet_whiteboard', {
    p_actor_id: actor,
    p_meeting_id: meetingId,
    p_whiteboard_id: id,
    p_guest_access: requested ?? 'view',
  });
  // Linking an existing pair keeps its stored access; apply an explicit request.
  if (requested && row.guest_access !== requested)
    return rpc<Row>('set_meet_whiteboard_guest_access', {
      p_actor_id: actor,
      p_meeting_id: meetingId,
      p_whiteboard_id: id,
      p_guest_access: requested,
    });
  return row;
}

export async function runMeetingWhiteboardAction(
  access: Access,
  action: Exclude<WhiteboardAction, { action: 'join' }>
) {
  await proveAdmission(access);
  const actor = member(access).user.id;
  const meetingId = access.meeting.id;
  if (action.action === 'create') {
    const db = await adminDb();
    if (!(await canManage(access, db)))
      throw new MeetCallAccessError(
        403,
        'Only the host or an admin can add a board'
      );
    const { data, error } = await db
      .from('workspace_whiteboards')
      .insert({
        ws_id: access.meeting.ws_id,
        creator_id: actor,
        title: action.title,
      })
      .select('id')
      .single();
    if (error || !data)
      throw new MeetCallAccessError(
        error?.message?.includes('WHITEBOARD_CREATE_RATE_LIMIT_EXCEEDED')
          ? 429
          : 503,
        'Whiteboard could not be created'
      );
    try {
      const row = await link(access, data.id, action.guestAccess);
      return { boardId: data.id, guestAccess: row.guest_access };
    } catch (error) {
      // The board only exists to be linked; remove it when linking is refused.
      await db.from('workspace_whiteboards').delete().eq('id', data.id);
      throw error;
    }
  }
  if (action.action === 'link') {
    const row = await link(access, action.boardId, action.guestAccess);
    return { boardId: action.boardId, guestAccess: row.guest_access };
  }
  if (action.action === 'unlink') {
    try {
      await rpc('unlink_meet_whiteboard', {
        p_actor_id: actor,
        p_meeting_id: meetingId,
        p_whiteboard_id: action.boardId,
      });
    } catch (error) {
      // A second unlink finds the link already gone, which is the goal.
      if (!(error instanceof MeetCallAccessError && error.status === 404))
        throw error;
    }
    return { boardId: action.boardId, unlinked: true };
  }
  const row = await rpc<Row>('set_meet_whiteboard_guest_access', {
    p_actor_id: actor,
    p_meeting_id: meetingId,
    p_whiteboard_id: action.boardId,
    p_guest_access: action.guestAccess,
  });
  return { boardId: action.boardId, guestAccess: row.guest_access };
}
