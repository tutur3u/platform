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
import { getTranslations } from 'next-intl/server';
import { connection } from 'next/server';
import { z } from 'zod';
import { MEETING_APP } from '../../../../../runtime';
import { miraConfirmationLocale } from '../../../../../features/live-assistant/account-confirmation';
import { hashMiraNotice } from '../../../../../features/live-assistant/mira-notice-hash';
import { MiraTtlCache } from '../../../../../features/live-assistant/mira-ttl-cache';
import {
  confirmMiraAccount,
  readMiraAccountConfirmation,
  requireMiraAccountConfirmation,
  usesMiraAccountConfirmation,
  withdrawMiraAccount,
} from '../../../../../features/live-assistant/server/account-confirmation';
import {
  readPrivateMiraChoice,
  stopPrivateMiraSessions,
} from '../../../../../features/live-assistant/server/private-consent';
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
      source: z.enum(['join', 'confirm', 'toggle', 'auto_on']),
      expectedActorId: z.uuid().optional(),
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
      locale: miraConfirmationLocale,
    })
    .strict(),
  z
    .object({
      action: z.literal('withdraw_account'),
      expectedActorId: z.uuid(),
      locale: miraConfirmationLocale,
    })
    .strict(),
]);

/** A storage check that cannot run counts as unable to store: fail closed. */
const canStoreModeOrFalse = () => canStoreMiraNoticeMode().catch(() => false);

const lastChoices = new MiraTtlCache<'on' | 'off' | null | undefined>();
const choiceKey = (access: MeetCallRouteAccess) =>
  `${access.meeting.id}:${access.user.id}`;

async function applyOwnChoice(
  access: MeetCallRouteAccess,
  input: Parameters<typeof applyRoomMiraChoice>[1],
  requireNoticeMode: boolean,
  accountFlow: boolean
) {
  try {
    await applyRoomMiraChoice(access, input, requireNoticeMode, accountFlow);
  } finally {
    lastChoices.delete(choiceKey(access));
  }
}

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
    accountConfirmation === 'confirmed' &&
    view.acceptance &&
    view.lastChoice === null
      ? await lastChoices.read(
          choiceKey(access),
          () =>
            readOwnMiraLastChoice({
              meetingId: access.meeting.id,
              participantId: access.user.id,
              guest: false,
              explicitOnly: true,
            }),
          (choice) => choice !== undefined
        )
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
      await confirmMiraAccount(access, data.expectedActorId, data.locale);
      if (!(await readRoomMiraAvailability(access)))
        return { available: false };
      return readView(access);
    }
    if (data.action === 'withdraw_account') {
      if (MEETING_APP !== 'meet')
        throw new MeetCallAccessError(403, 'Mira confirmation is unavailable');
      if (access.guest || access.user.id !== data.expectedActorId)
        throw new MeetCallAccessError(403, 'Mira account changed');
      const t = await getTranslations({
        locale: data.locale,
        namespace: 'meet.mira_consent',
      });
      await applyOwnChoice(
        access,
        {
          choice: 'off',
          source: 'toggle',
          version: MIRA_ROOM_NOTICE_VERSION,
          acceptanceRevision: 0,
          textHash: await hashMiraNotice(t('withdraw_account')),
          locale: data.locale,
        },
        false,
        accountFlow
      );
      try {
        await withdrawMiraAccount(access, data.expectedActorId);
      } catch {
        throw new MeetCallAccessError(
          503,
          'Mira is off in this call. Retry withdrawing your confirmation.',
          'withdraw_incomplete'
        );
      }
      // A non-admitted account has no active private grant in this room.
      // The room read already enforces admission for the caller's own list.
      try {
        const privateChoice = await readPrivateMiraChoice(access).catch(
          (error: unknown) => {
            if (
              error instanceof MeetCallAccessError &&
              error.status === 403 &&
              error.code === undefined
            )
              return null;
            throw error;
          }
        );
        if (privateChoice)
          await stopPrivateMiraSessions(access, privateChoice.sessions);
      } catch {
        throw new MeetCallAccessError(
          503,
          'Retry stopping Private Mira in this call.',
          'withdraw_incomplete'
        );
      }
      if (!(await readRoomMiraAvailability(access)))
        return { available: false };
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
    if (data.expectedActorId && data.expectedActorId !== access.user.id)
      throw new MeetCallAccessError(403, 'Mira account changed');
    if (
      data.source === 'auto_on' &&
      (!accountFlow || data.choice !== 'on' || !data.expectedActorId)
    )
      throw new MeetCallAccessError(
        403,
        'Automatic Mira activation is unavailable'
      );

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
        if (data.source === 'join')
          throw new MeetCallAccessError(
            409,
            'Refresh Meet before joining with Mira on',
            'mira_notice_required'
          );
        if (data.source === 'auto_on') {
          const previous = await readOwnMiraLastChoice({
            meetingId: access.meeting.id,
            participantId: access.user.id,
            guest: false,
            explicitOnly: true,
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
        const { acceptance } = await callRoomService<MiraRoomView>(access, {
          action: 'mira.room.read',
        });
        if (
          acceptance?.accountConfirmationRequired !== true ||
          acceptance.revision !== data.acceptanceRevision
        )
          throw new MeetCallAccessError(
            409,
            'Mira acceptance changed',
            'MIRA_ROOM_STALE'
          );
        if (data.source === 'auto_on') {
          const locale = miraConfirmationLocale.safeParse(data.locale);
          if (!locale.success)
            throw new MeetCallAccessError(400, 'Invalid locale');
          const t = await getTranslations({
            locale: locale.data,
            namespace: 'meet.mira_consent',
          });
          const textHash = await hashMiraNotice(
            t('indicator_on', { name: acceptance.acceptorName })
          );
          if (data.textHash !== textHash)
            throw new MeetCallAccessError(
              409,
              'The Mira notice changed',
              'mira_notice_required'
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
    await applyOwnChoice(access, data, requireNoticeMode, accountFlow);
    return readView(access);
  });
}
