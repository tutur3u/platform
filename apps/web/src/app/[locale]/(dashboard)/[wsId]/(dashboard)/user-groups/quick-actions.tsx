const FORCE_SHOW_IN_DEV = false;
const DEV_MODE = process.env.NODE_ENV === 'development';

interface UserGroupQuickActionsProps {
  wsId: string;
}

export default async function UserGroupQuickActions({
  wsId,
}: UserGroupQuickActionsProps) {
  // Check if the feature is enabled via workspace secret
  const featureEnabled = await checkFeatureEnabled(wsId);

  if (!featureEnabled && !(FORCE_SHOW_IN_DEV && DEV_MODE)) {
    return null;
  }

  const { default: UserGroupQuickActionsContent } = await import(
    './quick-actions-content'
  );

  return <UserGroupQuickActionsContent wsId={wsId} />;
}

async function checkFeatureEnabled(wsId: string): Promise<boolean> {
  try {
    const { createAdminClient } = await import(
      '@tuturuuu/supabase/next/server'
    );
    const sbAdmin = await createAdminClient();

    const { data } = await sbAdmin
      .from('workspace_secrets')
      .select('value')
      .eq('ws_id', wsId)
      .eq('name', 'SHOW_USER_GROUP_QUICK_ACTIONS_IN_DASHBOARD')
      .maybeSingle();

    return data?.value === 'true';
  } catch {
    return false;
  }
}
