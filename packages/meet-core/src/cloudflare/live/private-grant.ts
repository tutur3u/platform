import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import { z } from 'zod';
import {
  MIRA_ACCOUNT_CONFIRMATION_KEY,
  miraConfirmedAt,
} from '../../features/live-assistant/account-confirmation';
import {
  miraAttestationFromRow,
  miraDemoAdmission,
} from '../../features/live-assistant/demo-admission';
import {
  isMiraPaidTier,
  isMiraPaidTierEnabled,
  miraPayerMatchesBilling,
  newestActiveSubscriptionTier,
} from '../../features/live-assistant/mira-entitlement';
import { MiraTtlCache } from '../../features/live-assistant/mira-ttl-cache';
import { hasMiraAdultAttestation } from '../../features/live-assistant/participant-consent';
import { liveRoomCommand } from './room';
import type { SavedSession } from './session-state';
import { liveAuthUser, liveDatabase, type LiveEnvironment } from './storage';
import { liveWorkspaceAllowed } from './workspace-gate';

const confirmations = new MiraTtlCache<number | null>();

/**
 * When the owner last confirmed Mira (0 for an undated marker), or null when
 * the account is not confirmed. A failed lookup throws, so it is never taken
 * for a withdrawal. Confirmed times are cached per isolate for up to a minute.
 */
export async function readLiveMiraConfirmedAt(
  env: LiveEnvironment,
  ownerId: string
) {
  return confirmations
    .read(
      ownerId,
      async () => {
        const actor = authResult.parse(await liveAuthUser(env, ownerId));
        return actor.id === ownerId
          ? miraConfirmedAt(actor.app_metadata?.[MIRA_ACCOUNT_CONFIRMATION_KEY])
          : null;
      },
      (value) => value !== null
    );
}

export async function requireCurrentPrivateGrant(
  env: LiveEnvironment,
  saved: Pick<SavedSession, 'claims' | 'identity'>
) {
  const result = await liveRoomCommand<{
    choice?: {
      choice: string;
      accountId: string;
      meetingId: string;
      version: string;
      revision: number;
    } | null;
  }>(env, saved.claims, saved.identity, { action: 'mira.private.read' });
  const choice = result.choice;
  if (
    saved.claims.mode !== 'personal' ||
    !choice ||
    choice.choice !== 'continue' ||
    choice.accountId !== saved.claims.ownerId ||
    choice.meetingId !== saved.claims.meetingId ||
    choice.version !== saved.claims.consentVersion ||
    choice.revision !== saved.claims.consentRevision
  )
    throw new Error('Private Mira choice is unavailable');

  if (env.MEET_UX_V2 === 'true' && saved.claims.app !== 'parley') {
    // A failed lookup refuses the grant with the same message as a missing
    // confirmation, so callers never see the raw auth error.
    const confirmedAt = await readLiveMiraConfirmedAt(
      env,
      saved.claims.ownerId
    ).catch(() => null);
    if (confirmedAt === null)
      throw new Error('Private Mira account confirmation is unavailable');
  }

  if (saved.claims.workspaceAuthority === 'workspace-admin') {
    const workspaceId = z.uuid().parse(saved.identity.workspaceId);
    const { workspace, attestation } = await readLiveWorkspaceAudience(
      env,
      workspaceId
    );
    if (
      !hasMiraAdultAttestation({
        workspaceId,
        workspaceOwnerId: workspace.creator_id,
        attestation,
      })
    )
      throw new Error(
        'Private Mira workspace owner attestation is unavailable'
      );
  }
}

const authUser = z.object({
  id: z.uuid(),
  email: z.string().nullable().optional(),
  email_confirmed_at: z.string().nullable().optional(),
  app_metadata: z.record(z.string(), z.unknown()).optional(),
  identities: z
    .array(
      z.object({
        provider: z.string(),
        identity_data: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .optional(),
});
const authResult = z.union([
  authUser,
  z.object({ user: authUser }).transform(({ user }) => user),
]);
const workspaceResult = z
  .array(
    z.object({
      id: z.uuid(),
      personal: z.boolean().nullable(),
      creator_id: z.uuid().nullable(),
      deleted: z.boolean().nullable(),
    })
  )
  .length(1);
const membershipResult = z.array(z.object({ type: z.string() })).length(1);
const attestationResult = z
  .array(
    z.object({
      ws_id: z.uuid(),
      audience: z.string(),
      attested_by: z.uuid().nullable(),
      attested_at: z.string(),
    })
  )
  .max(1);
const personalResult = z.array(z.object({ id: z.uuid() })).max(1);
const subscriptionResult = z.array(
  z.object({
    created_at: z.string(),
    status: z.string().nullable(),
    product_id: z.string().nullable(),
  })
);
const productResult = z.array(
  z.object({ id: z.string(), tier: z.string().nullable() })
);

/** Hosting's paid-tier rule, read over the Worker's server-only REST client. */
export async function readLivePaidAccount(
  env: LiveEnvironment,
  ownerId: string
) {
  if (!isMiraPaidTierEnabled(env.MEET_PAID_TIER_HOSTING_ENABLED)) return false;
  const [personal] = personalResult.parse(
    await liveDatabase<unknown>(
      env,
      `workspaces?creator_id=eq.${ownerId}&personal=eq.true&or=(deleted.is.null,deleted.eq.false)&select=id&limit=1`
    )
  );
  if (!personal) return false;
  const subscriptions = subscriptionResult.parse(
    await liveDatabase<unknown>(
      env,
      `workspace_subscriptions?ws_id=eq.${personal.id}&status=eq.active&select=created_at,status,product_id`
    )
  );
  const ids = [
    ...new Set(
      subscriptions
        .map((subscription) => subscription.product_id)
        .filter((id): id is string => !!id)
    ),
  ];
  if (!ids.length) return false;
  if (ids.some((id) => !z.uuid().safeParse(id).success)) return false;
  const products = productResult.parse(
    await liveDatabase<unknown>(
      env,
      `workspace_subscription_products?id=in.(${ids.join(',')})&select=id,tier`,
      { schema: 'private' }
    )
  );
  return isMiraPaidTier(
    newestActiveSubscriptionTier(
      subscriptions,
      new Map(products.map((product) => [product.id, product.tier]))
    )
  );
}

async function readLiveWorkspaceAudience(
  env: LiveEnvironment,
  workspaceId: string
) {
  const [rawWorkspace, rawAttestation] = await Promise.all([
    liveDatabase<unknown>(
      env,
      `workspaces?id=eq.${workspaceId}&select=id,personal,creator_id,deleted&limit=1`
    ),
    liveDatabase<unknown>(
      env,
      `workspace_mira_audience_attestations?ws_id=eq.${workspaceId}&select=ws_id,audience,attested_by,attested_at&limit=1`,
      { schema: 'private' }
    ),
  ]);
  const [workspace] = workspaceResult.parse(rawWorkspace);
  if (!workspace || workspace.id !== workspaceId || workspace.deleted === true)
    throw new Error('Private Mira workspace is unavailable');
  const [attestation] = attestationResult.parse(rawAttestation);
  return {
    workspace,
    attestation: miraAttestationFromRow(attestation ?? null, workspaceId),
  };
}

/** The signed session records the grant at admission. Code tools need current authority. */
export async function requireCurrentLiveDemoAuthority(
  env: LiveEnvironment,
  saved: SavedSession
) {
  if (!liveWorkspaceAllowed(env, saved))
    throw new Error('Private Mira demo authority is unavailable');
  const ownerId = z.uuid().parse(saved.claims.ownerId);
  const workspaceId = z.uuid().parse(saved.identity.workspaceId);
  const [rawUser, rawMembership, { workspace, attestation }] =
    await Promise.all([
      liveAuthUser(env, ownerId),
      liveDatabase<unknown>(
        env,
        `workspace_members?ws_id=eq.${workspaceId}&user_id=eq.${ownerId}&select=type&limit=1`
      ),
      readLiveWorkspaceAudience(env, workspaceId),
    ]);
  const actor = authResult.parse(rawUser);
  const [membership] = membershipResult.parse(rawMembership);
  if (actor.id !== ownerId)
    throw new Error('Private Mira demo authority is unavailable');

  const paidAccount = isVerifiedTuturuuuStaffSession(actor)
    ? false
    : await readLivePaidAccount(env, ownerId);
  const authority = miraDemoAdmission({
    actor,
    workspaceId,
    meetingId: saved.claims.meetingId,
    workspaceMember: membership?.type === 'MEMBER',
    admitted: true,
    explicitEnable: true,
    disabled: false,
    personalWorkspace: workspace.personal === true,
    workspaceOwnerId: workspace.creator_id,
    attestation,
    paidAccount,
  });
  if (
    !authority.allowed ||
    authority.authority !== saved.claims.workspaceAuthority ||
    !miraPayerMatchesBilling(authority.payer, saved.claims.billingWorkspaceId)
  )
    throw new Error('Private Mira demo authority is unavailable');
}
