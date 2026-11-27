import 'server-only';

import { getCloudflareContext } from '@opennextjs/cloudflare';
import { capMaxOutputTokensByCredits } from '@tuturuuu/ai/credits/cap-output-tokens';
import { checkAiCredits } from '@tuturuuu/ai/credits/check-credits';
import { answerMeetChat } from '@tuturuuu/ai/meetings/chat';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';
import { readMiraDemoAuthority } from '../../../live-assistant/server/demo-authority';
import { privateMiraBillingWorkspace } from '../../../live-assistant/server/mira-billing';
import { requirePrivateMiraChoice } from '../../../live-assistant/server/private-consent';
import { isMeetAiEnabledForWorkspace } from '../../../meeting-ai/server/workspace-gate';
import { MeetCallAccessError } from '../../lib/call-access';
import { billMeetChat } from '../chat-billing';
import { getMeetChatModel } from '../chat-model';
import { resolveMeetClassRole } from '../class-role';
import {
  callRoomService,
  type MeetCallRouteAccess,
  type SignedInMeetCallAccess,
} from '../room-service';
import {
  buildMiraActivityPrompt,
  type MiraActivityDraftResult,
  miraActivityDraftRequestSchema,
  parseMiraActivityDraftOutput,
} from './mira-activity-draft-schema';

export {
  MIRA_ACTIVITY_DIFFICULTIES,
  MIRA_ACTIVITY_KINDS,
  type MiraActivityDifficulty,
  type MiraActivityDraftRequest,
  type MiraActivityDraftResult,
  type MiraActivityKind,
  miraActivityDraftRequestSchema,
} from './mira-activity-draft-schema';

const envConfigSchema = z.object({
  MEET_AI_DISABLED: z.enum(['false', '0']),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
});

const roomAuthSchema = z.object({
  ok: z.literal(true),
  admitted: z.boolean(),
});

function requireSignedInAccess(
  access: MeetCallRouteAccess
): SignedInMeetCallAccess {
  if (('guest' in access && access.guest) || !access.user?.id) {
    throw new MeetCallAccessError(
      401,
      'Sign in to use Mira',
      'MIRA_AUTH_REQUIRED'
    );
  }
  return access;
}

function unavailableError(reason?: string): MeetCallAccessError {
  if (reason === 'workspace') {
    return new MeetCallAccessError(
      403,
      'Mira draft is unavailable',
      'MIRA_WORKSPACE_UNAVAILABLE'
    );
  }
  return new MeetCallAccessError(
    403,
    'Mira draft is unavailable',
    'MIRA_DRAFT_UNAVAILABLE'
  );
}

/**
 * Generates a structured live-activity draft using Private Mira under strict
 * fail-closed boundaries:
 * 1. Signed-in host or workspace co-host only (guests always rejected 401).
 * 2. Strict Zod validation on prompt length, item count, and activity kind.
 * 3. Cloudflare Meet AI workspace gate (MEET_AI_DISABLED, kill switch,
 *    protected/disabled workspaces, allow-all / allowlist).
 * 4. Room DO authorization (`activities.authorize`: live meeting, admitted or
 *    approved caller, `canMeetRealtimeRunActivities`) before consent and again
 *    before/after generation.
 * 5. Private Mira consent + 18+ adult-only workspace attestation & paid/staff
 *    entitlement via `readMiraDemoAuthority` with room-verified `admitted`.
 * 6. Billing charged to `privateMiraBillingWorkspace(authority.payer, userId)`.
 * 7. Strict Zod validation of model JSON output before returning.
 */
export async function draftMeetLiveActivity(
  rawAccess: MeetCallRouteAccess,
  rawInput: unknown
): Promise<MiraActivityDraftResult> {
  const access = requireSignedInAccess(rawAccess);
  const input = miraActivityDraftRequestSchema.parse(rawInput);

  if (!access.canReadWorkspace) {
    throw unavailableError();
  }
  let coHost = false;
  if (!access.isHost) {
    const role = await resolveMeetClassRole(access);
    if (!role.coHost) {
      throw unavailableError();
    }
    coHost = true;
  }

  const cloudflare = await getCloudflareContext({ async: true }).catch(
    () => null
  );
  const config = envConfigSchema.safeParse(cloudflare?.env);
  if (!config.success) {
    throw unavailableError();
  }
  if (!isMeetAiEnabledForWorkspace(access.meeting.ws_id, cloudflare?.env)) {
    throw unavailableError();
  }

  const authorizeRoom = async () => {
    const raw = await callRoomService(
      access,
      { action: 'activities.authorize' },
      coHost ? { coHost: true } : undefined
    );
    const parsed = roomAuthSchema.safeParse(raw);
    if (!parsed.success) {
      throw unavailableError();
    }
    return parsed.data;
  };

  const roomAuth = await authorizeRoom();
  const consent = await requirePrivateMiraChoice(access);
  const userId = access.user.id;
  const authority = await readMiraDemoAuthority({
    accountId: userId,
    workspaceId: access.meeting.ws_id,
    meetingId: access.meeting.id,
    workspaceMember: access.canReadWorkspace,
    admitted: roomAuth.admitted,
    disabledBinding: config.data.MEET_AI_DISABLED,
  });
  if (!authority.allowed) {
    throw unavailableError(authority.reason);
  }

  const checkConsent = async () => {
    await authorizeRoom();
    const current = await requirePrivateMiraChoice(access);
    if (current.revision !== consent.revision) {
      throw new MeetCallAccessError(
        403,
        'Private Mira choice changed',
        'MIRA_CONSENT_REQUIRED'
      );
    }
  };

  const prompt = buildMiraActivityPrompt(input);
  const wsId = await privateMiraBillingWorkspace(authority.payer, userId);
  const model = await getMeetChatModel(wsId);
  const inputBudget = 3 * (new TextEncoder().encode(prompt).byteLength + 6000);
  const allowance = await checkAiCredits(wsId, model.id, 'chat', {
    userId,
    estimatedInputTokens: inputBudget,
  });
  if (!allowance.allowed) {
    throw new MeetCallAccessError(
      403,
      'AI quota is unavailable',
      'MIRA_CREDITS_UNAVAILABLE'
    );
  }

  const db = await createAdminClient({ noCookie: true });
  const cap = await capMaxOutputTokensByCredits(
    db,
    model.id,
    Math.min(allowance.maxOutputTokens ?? 4096, 4096),
    allowance.remainingCredits
  );
  if (!cap) {
    throw new MeetCallAccessError(
      403,
      'AI quota is exhausted',
      'MIRA_CREDITS_UNAVAILABLE'
    );
  }

  const provider = { apiKey: config.data.GOOGLE_GENERATIVE_AI_API_KEY };
  const answer = await billMeetChat(
    {
      userId,
      workspaceId: wsId,
      model,
      maxOutputTokens: cap,
      inputBudget,
      remainingCredits: allowance.remainingCredits,
      requestId: crypto.randomUUID(),
      allowSearch: false,
    },
    async () => {
      await checkConsent();
      return answerMeetChat(
        [],
        cap,
        prompt,
        model,
        {
          title: 'Live activity drafting',
          observedAt: new Date().toISOString(),
          timezone: 'UTC',
          participantCount: 0,
          deviceCount: 0,
          participants: [],
        },
        { audience: 'private', provider, allowSearch: false }
      );
    }
  );

  await checkConsent();
  return parseMiraActivityDraftOutput(input.kind, answer.text, input.count);
}
