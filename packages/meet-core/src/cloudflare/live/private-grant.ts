import { z } from 'zod';
import {
  miraDemoAdmission,
  readMiraAdultAttestation,
} from '../../features/live-assistant/demo-admission';
import { liveRoomCommand } from './room';
import type { SavedSession } from './session-state';
import { liveAuthUser, liveDatabase, type LiveEnvironment } from './storage';
import { liveWorkspaceAllowed } from './workspace-gate';

export async function requireCurrentPrivateGrant(
  env: LiveEnvironment,
  saved: SavedSession
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
}

const authUser = z.object({
  id: z.uuid(),
  email: z.string().nullable().optional(),
  email_confirmed_at: z.string().nullable().optional(),
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

/** The signed session records the grant at admission. Code tools need current authority. */
export async function requireCurrentLiveDemoAuthority(
  env: LiveEnvironment,
  saved: SavedSession
) {
  if (!liveWorkspaceAllowed(env, saved))
    throw new Error('Private Mira demo authority is unavailable');
  const ownerId = z.uuid().parse(saved.claims.ownerId);
  const workspaceId = z.uuid().parse(saved.identity.workspaceId);
  const [rawUser, rawWorkspace, rawMembership, attestation] = await Promise.all(
    [
      liveAuthUser(env, ownerId),
      liveDatabase<unknown>(
        env,
        `workspaces?id=eq.${workspaceId}&select=id,personal,creator_id,deleted&limit=1`
      ),
      liveDatabase<unknown>(
        env,
        `workspace_members?ws_id=eq.${workspaceId}&user_id=eq.${ownerId}&select=type&limit=1`
      ),
      readMiraAdultAttestation(workspaceId),
    ]
  );
  const actor = authResult.parse(rawUser);
  const [workspace] = workspaceResult.parse(rawWorkspace);
  const [membership] = membershipResult.parse(rawMembership);
  if (
    actor.id !== ownerId ||
    workspace?.id !== workspaceId ||
    workspace.deleted === true
  )
    throw new Error('Private Mira demo authority is unavailable');

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
  });
  if (
    !authority.allowed ||
    authority.authority !== saved.claims.workspaceAuthority
  )
    throw new Error('Private Mira demo authority is unavailable');
}
