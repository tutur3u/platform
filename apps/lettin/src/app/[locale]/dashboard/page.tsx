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
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ invitation?: string }>;
}) {
  await connection();
  const { invitation } = await searchParams;
  const next = `/dashboard${invitation ? `?invitation=${encodeURIComponent(invitation)}` : ''}`;
  if (!(await getSatelliteAppSessionUser('lettin')))
    redirect(`/login?next=${encodeURIComponent(next)}`);
  const requestHeaders = await headers();
  const pending = await getPendingWorkspaceInvitations(requestHeaders);
  if (pending[0])
    redirect(
      `/${pending[0].workspace.id}${invitation ? `?invitation=${encodeURIComponent(invitation)}` : ''}`
    );
  const auth = withForwardedInternalApiAuth(requestHeaders);
  const workspace =
    (await getCurrentUserDefaultWorkspace(auth)) ??
    (await listWorkspaces(auth))[0];
  if (!workspace) redirect(`/login?refresh=1&next=${encodeURIComponent(next)}`);
  redirect(
    `/${workspace.id}${invitation ? `?invitation=${encodeURIComponent(invitation)}` : ''}`
  );
}
