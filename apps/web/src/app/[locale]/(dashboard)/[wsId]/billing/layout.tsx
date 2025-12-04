import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { notFound } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';

export default async function BillingLayout({
  params,
  children,
}: {
  params: Promise<{ wsId: string }>;
  children: React.ReactNode;
}) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const user = await getCurrentSupabaseUser();
        if (!user) {
          return notFound();
        }

        const supabase = await createClient();

        const {
          data: hasManageSubscriptionPermission,
          error: hasManageSubscriptionPermissionError,
        } = await supabase.rpc('has_workspace_permission', {
          p_user_id: user.id,
          p_ws_id: wsId,
          p_permission: 'manage_subscription',
        });

        if (hasManageSubscriptionPermissionError) {
          console.error(
            'Error checking manage subscription permission:',
            hasManageSubscriptionPermissionError
          );
          return notFound();
        }

        if (!hasManageSubscriptionPermission) {
          console.error('You are not authorized to access the billing page');
          return notFound();
        }

        return children;
      }}
    </WorkspaceWrapper>
  );
}
