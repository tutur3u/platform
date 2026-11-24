import { getTranslations } from 'next-intl/server';
import { redirectToWorkspaceSettingsTab } from '@/lib/workspace-settings-tab-redirect';

export async function generateMetadata() {
  const t = await getTranslations('workspace-sso');
  return { title: t('title') };
}

/**
 * SSO lives in the settings dialog (Current workspace -> SSO), which
 * shows it only to members with the same permissions. This route keeps
 * bookmarks working by opening that tab over the workspace.
 */
export default async function WorkspaceSSOPage({
  params,
}: {
  params: Promise<{ locale: string; wsId: string }>;
}) {
  const { locale, wsId } = await params;
  redirectToWorkspaceSettingsTab({ locale, tab: 'workspace_sso', wsId });
}
