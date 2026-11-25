import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import {
  callRoomService,
  guestPollRoomRoute,
  type MeetCallRouteAccess,
} from '@tuturuuu/meet-core/features/call/server/room-service';
import {
  MIRA_ROOM_CAPABILITIES,
  MIRA_ROOM_NOTICE_VERSION,
  type MiraRoomView,
} from '@tuturuuu/realtime/meet';
import { connection } from 'next/server';
import { z } from 'zod';
import {
  confirmMiraAccount,
  readMiraAccountConfirmation,
  requireMiraAccountConfirmation,
  usesMiraAccountConfirmation,
} from '../../../../../features/live-assistant/server/account-confirmation';
import {
  acceptRoomMira,
  endRoomMira,
} from '../../../../../features/live-assistant/server/room-mira-acceptance';
import { readRoomMiraAvailability } from '../../../../../features/live-assistant/server/room-mira-authority';
import { requireCurrentMiraNoticeMode } from '../../../../../features/live-assistant/server/room-mira-notice-mode';
import { applyRoomMiraChoice } from '../../../../../features/live-assistant/server/room-mira-choice';
import {
  canStoreMiraNoticeMode,
  readMiraBoxTickedByDefault,
  readOpenMiraAcceptanceRevision,
  readOwnMiraLastChoice,
} from '../../../../../features/live-assistant/server/room-mira-evidence';

const isGuest = (access: MeetCallRouteAccess) =>
  'guest' in access && access.guest === true;

const command = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('choice'),
      choice: z.enum(['on', 'off']),
      version: z.literal(MIRA_ROOM_NOTICE_VERSION),
      acceptanceRevision: z.number().int().nonnegative(),
      source: z.enum(['join', 'confirm', 'toggle']),
      // SHA-256 hex of the exact notice text shown, and its locale.
      textHash: z.string().regex(/^[0-9a-f]{64}$/),
      locale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
      // The notice shown: room capture (default) or per-speaker capture.
      noticeMode: z.enum(['room', 'self']).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('accept'),
      capabilities: z
        .array(z.enum(MIRA_ROOM_CAPABILITIES))
        .min(1)
        .max(MIRA_ROOM_CAPABILITIES.length),
      audienceAdultConfirmed: z.literal(true),
      expectedActorId: z.uuid().optional(),
    })
    .strict(),
  z.object({ action: z.literal('end') }).strict(),
  z.object({ action: z.literal('report_minor') }).strict(),
  z
    .object({
      action: z.literal('confirm_account'),
      expectedActorId: z.uuid(),
    })
    .strict(),
]);

/** A storage check that cannot run counts as unable to store: fail closed. */
const canStoreModeOrFalse = () => canStoreMiraNoticeMode().catch(() => false);

async function readView(access: MeetCallRouteAccess) {
  const [view, boxTickedByDefault, accountConfirmation] = await Promise.all([
    callRoomService<MiraRoomView>(access, { action: 'mira.room.read' }),
    // A failed default lookup shows the box unticked, never fails the view.
    readMiraBoxTickedByDefault(access.meeting.ws_id).catch(() => false),
    usesMiraAccountConfirmation()
      ? readMiraAccountConfirmation(access)
      : undefined,
  ]);
  // The evidence ledger can outlive the room snapshot. Never automatically
  // include someone whose last durable choice was off.
  if (!accountConfirmation)
    return { available: true as const, ...view, boxTickedByDefault };
  const lastChoice =
    accountConfirmation !== 'guest' && view.lastChoice === null
      ? await readOwnMiraLastChoice({
          meetingId: access.meeting.id,
          participantId: access.user.id,
          guest: false,
        })
      : view.lastChoice;
  return {
    available: true as const,
    ...view,
    boxTickedByDefault,
    accountConfirmation,
    lastChoice: lastChoice ?? null,
    ...(lastChoice === undefined ? { autoJoinBlocked: true } : {}),
  };
}

/**
 * Room Mira for every admitted participant, anonymous guests included. Each
 * account records only its own choice; the host or a co-host accepts for the
 * meeting. Only aggregate counts are returned, never who is on or off.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  await connection();
  const { meetingId } = await params;
  return guestPollRoomRoute(request, meetingId, async (access) => {
    if (!(await readRoomMiraAvailability(access))) return { available: false };
    try {
      return await readView(access);
    } catch (error) {
      // Not admitted yet: the join box needs only the workspace default.
      if (!(error instanceof MeetCallAccessError) || error.status !== 403)
        throw error;
      const [defaultTicked, joinRevision, joinLastChoice] = await Promise.all([
        // A failed lookup shows the box unticked, never fails the read.
        readMiraBoxTickedByDefault(access.meeting.ws_id).catch(() => false),
        readOpenMiraAcceptanceRevision(access.meeting.id),
        // Only the caller's own latest choice, so a rejoin never shows the
        // box ticked over an earlier off.
        readOwnMiraLastChoice({
          meetingId: access.meeting.id,
          participantId: access.user.id,
          guest: isGuest(access),
        }),
      ]);
      return {
        available: false,
        // An unknown own choice shows the box unticked, never ticked.
        joinDefault: defaultTicked && joinLastChoice !== undefined,
        joinRevision,
        ...(joinLastChoice === undefined ? {} : { joinLastChoice }),
      };
    }
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;
  return guestPollRoomRoute(request, meetingId, async (access) => {
    const input = command.safeParse(await request.json().catch(() => null));
    if (!input.success) throw new MeetCallAccessError(400, 'Invalid request');
    const data = input.data;
    const accountFlow = usesMiraAccountConfirmation();
    if (data.action === 'confirm_account') {
      if (!accountFlow)
        throw new MeetCallAccessError(403, 'Mira confirmation is unavailable');
      // Require live presence before recording a confirmation from this call.
      await callRoomService(access, { action: 'mira.room.read' });
      await confirmMiraAccount(access, data.expectedActorId);
      if (!(await readRoomMiraAvailability(access))) return { available: false };
      return readView(access);
    }
    if (data.action === 'accept') {
      if (accountFlow && data.expectedActorId !== access.user.id)
        throw new MeetCallAccessError(403, 'Mira account changed');
      await acceptRoomMira(access, data.capabilities);
      return readView(access);
    }
    if (data.action === 'end' || data.action === 'report_minor') {
      await endRoomMira(
        access,
        data.action === 'end' ? 'turned_off' : 'minor_reported'
      );
      return readView(access);
    }
    // Off always records, so anyone can turn Mira off for themselves.
    if (data.choice === 'on' && !(await readRoomMiraAvailability(access)))
      throw new MeetCallAccessError(403, 'Room Mira is unavailable');
    // On counts only under the notice for the room's current transcript
    // mode. In a per-speaker room it also needs storage for that mode, checked
    // before the room changes so a refusal leaves the room untouched.
    let requireNoticeMode = false;
    if (data.choice === 'on') {
      if (accountFlow) {
        await requireMiraAccountConfirmation(access);
        if (data.source === 'join') {
          const previous = await readOwnMiraLastChoice({
            meetingId,
            participantId: access.user.id,
            guest: false,
          });
          if (previous === undefined)
            throw new MeetCallAccessError(503, 'Your choice could not be read');
          if (previous === 'off')
            throw new MeetCallAccessError(
              409,
              'Turn Mira back on in the call',
              'MIRA_ROOM_JOIN_OVER_OFF'
            );
        }
      }
      const current = await requireCurrentMiraNoticeMode(
        access,
        data.noticeMode
      );
      requireNoticeMode = current === 'self';
      if (requireNoticeMode && !(await canStoreModeOrFalse()))
        throw new MeetCallAccessError(503, 'Your choice could not be saved');
    }
    await applyRoomMiraChoice(access, data, requireNoticeMode, accountFlow);
    return readView(access);
  });
}
