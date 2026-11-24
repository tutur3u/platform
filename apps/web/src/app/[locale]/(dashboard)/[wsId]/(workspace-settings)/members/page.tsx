import type { Metadata } from 'next';
import { redirectToWorkspaceSettingsTab } from '@/lib/workspace-settings-tab-redirect';

export const metadata: Metadata = {
  title: 'Members',
  description:
    'Manage Members in the Workspace Settings area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{ locale: string; wsId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}

/**
 * Member management lives in the settings dialog (Current workspace ->
 * Members), which enforces the same member and role permissions. This route
 * keeps bookmarks working by opening that tab, and its `?tab=` view, over the
 * workspace.
 */
export default async function WorkspaceMembersPage({
  params,
  searchParams,
}: Props) {
  const [{ locale, wsId }, { tab }] = await Promise.all([params, searchParams]);
  redirectToWorkspaceSettingsTab({
    locale,
    membersTab: tab,
    tab: 'workspace_members',
    wsId,
  });
}
