import {
  getCurrentUserDefaultWorkspace,
  listWorkspaces,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { getPendingWorkspaceInvitations } from '@tuturuuu/satellite/workspace-invitation';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { isCreativeSpace } from '@/components/spaces';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ invitation?: string; space?: string }>;
}) {
  await connection();
  const { invitation, space: requestedSpace } = await searchParams;
  const space =
    requestedSpace && isCreativeSpace(requestedSpace)
      ? requestedSpace
      : undefined;
  const query = new URLSearchParams();
  if (invitation) query.set('invitation', invitation);
  if (space) query.set('space', space);
  const next = `/dashboard${query.size ? `?${query}` : ''}`;
  const destination = (wsId: string) =>
    `/${wsId}${space ? `/spaces/${space}` : ''}${invitation ? `?invitation=${encodeURIComponent(invitation)}` : ''}`;
  if (!(await getSatelliteAppSessionUser('lettin')))
    redirect(`/login?next=${encodeURIComponent(next)}`);
  const requestHeaders = await headers();
  const pending = await getPendingWorkspaceInvitations(requestHeaders);
  if (pending[0]) redirect(destination(pending[0].workspace.id));
  const auth = withForwardedInternalApiAuth(requestHeaders);
  const workspace =
    (await getCurrentUserDefaultWorkspace(auth)) ??
    (await listWorkspaces(auth))[0];
  if (!workspace) redirect(`/login?refresh=1&next=${encodeURIComponent(next)}`);
  redirect(destination(workspace.id));
}
