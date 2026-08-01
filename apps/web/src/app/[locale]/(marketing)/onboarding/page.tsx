import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import {
  getCurrentUser,
  getUserDefaultWorkspace,
} from '@tuturuuu/utils/user-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

export const metadata: Metadata = {
  title: 'Get started with Tuturuuu',
  description: 'Choose a role and goal pathway from your Tuturuuu home.',
  robots: NO_INDEX_ROBOTS,
};

/**
 * Compatibility entry for old links. Onboarding now lives inside the normal
 * workspace home so it is always dismissible and never gates product access.
 */
export default async function OnboardingCompatibilityPage() {
  await connection();

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const workspace = await getUserDefaultWorkspace();
  const workspaceSlug = workspace
    ? toWorkspaceSlug(workspace.id, { personal: Boolean(workspace.personal) })
    : 'personal';

  redirect(`/${workspaceSlug}?guide=platform`);
}
