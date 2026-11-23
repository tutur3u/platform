import 'server-only';
import { readMiraDemoAuthority } from '../../live-assistant/server/demo-authority';
import { miraBillingWorkspaceId } from '../../live-assistant/mira-entitlement';
import { MeetAiError } from './access';
import { meetAiGateEnv } from './workspace-gate';

/**
 * The host's entitlement and payer for paid transcript and notes work, under
 * the same model as room Mira: the kill switch and Meet AI workspace gate,
 * workspace membership, and the Meet hosting account rule (verified
 * @tuturuuu.com staff, or a Plus, Pro or Enterprise Personal plan while paid
 * hosting is on). Free accounts are refused. Staff drain the Tuturuuu root
 * workspace; paid accounts charge the meeting workspace. Only the meeting
 * host reaches this, so guests never pay.
 */
export async function requireMeetTranscriptPayer(input: {
  userId: string;
  wsId: string;
  meetingId: string;
}) {
  const env = await meetAiGateEnv();
  const authority = await readMiraDemoAuthority({
    accountId: input.userId,
    workspaceId: input.wsId,
    meetingId: input.meetingId,
    admitted: true,
    workspaceMember: true,
    disabledBinding: env ? Reflect.get(env, 'MEET_AI_DISABLED') : undefined,
  });
  if (!authority.allowed)
    throw authority.reason === 'account'
      ? new MeetAiError(
          403,
          'Meet AI needs a Plus, Pro or Enterprise plan',
          'MEET_AI_ACCOUNT_UNAVAILABLE'
        )
      : new MeetAiError(
          403,
          'Meet AI is temporarily unavailable',
          'MEET_AI_WORKSPACE_NOT_ENABLED'
        );
  return {
    payer: authority.payer,
    billingWorkspaceId: miraBillingWorkspaceId(authority.payer, input.wsId),
  };
}
