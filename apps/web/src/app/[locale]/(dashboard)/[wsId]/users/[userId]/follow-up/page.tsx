import { AlertTriangleIcon } from '@tuturuuu/icons';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import FollowUpClient from './client';

export const metadata: Metadata = {
  title: 'Guest Lead Follow-up',
  description:
    'Configure and send a specialized follow-up report to a guest user.',
};

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
    userId: string;
  }>;
}

export default async function GuestLeadFollowUpPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, userId }) => {
        const permissions = await getPermissions({ wsId });
        if (!permissions) notFound();
        const { containsPermission } = permissions;
        const canCreateLeadGenerations = containsPermission(
          'create_lead_generations'
        );
        if (!canCreateLeadGenerations) {
          notFound();
        }
        const t = await getTranslations();
        const supabase = await createClient();
        const sbAdmin = await createAdminClient();

        const canCheckUserAttendance = containsPermission(
          'check_user_attendance'
        );

        // Check if user is eligible for lead generation email
        const { data: eligibility, error: eligibilityError } =
          await supabase.rpc('check_guest_lead_eligibility', {
            p_ws_id: wsId,
            p_user_id: userId,
          });

        // If not eligible or error occurred, show 404
        if (
          eligibilityError ||
          !eligibility ||
          typeof eligibility !== 'object' ||
          !('eligible' in eligibility) ||
          !eligibility.eligible
        ) {
          notFound();
        }

        // Fetch user info and their groups for context
        const { data: user } = await supabase
          .from('workspace_users')
          .select('id, full_name, email, ws_id, archived, archived_until, note')
          .eq('ws_id', wsId)
          .eq('id', userId)
          .maybeSingle();

        // Fetch user's groups for report context
        const { data: userGroups } = await supabase
          .from('workspace_user_groups_users')
          .select('group:workspace_user_groups!inner(id, name, ws_id)')
          .eq('user_id', userId)
          .eq('group.ws_id', wsId);

        // Fetch workspace email credentials on the server
        const { data: emailCreds } = await sbAdmin
          .from('workspace_email_credentials')
          .select('source_name, source_email')
          .eq('ws_id', wsId)
          .maybeSingle();

        const { data: minimumAttendance } = await supabase
          .from('workspace_settings')
          .select('guest_user_checkup_threshold')
          .eq('ws_id', wsId)
          .maybeSingle();

        return (
          <div className="flex w-full flex-col gap-4">
            {!emailCreds && (
              <div className="rounded-md border border-destructive bg-destructive/5 p-4">
                <div className="flex items-start gap-3">
                  <div className="text-destructive">
                    <AlertTriangleIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-destructive text-sm">
                      {t('users.follow_up.email_credentials_missing')}
                    </h3>
                    <p className="mt-1 text-muted-foreground text-sm">
                      {t(
                        'users.follow_up.email_credentials_not_configured_description'
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}
            <FollowUpClient
              wsId={wsId}
              userId={userId}
              userName={user?.full_name ?? undefined}
              userEmail={user?.email ?? undefined}
              userArchived={user?.archived ?? undefined}
              userArchivedUntil={user?.archived_until ?? undefined}
              userNote={user?.note ?? undefined}
              emailCredentials={emailCreds ?? undefined}
              userGroups={
                userGroups?.map((ug) => ({
                  id: ug.group.id,
                  name: ug.group.name,
                })) ?? []
              }
              minimumAttendance={
                minimumAttendance?.guest_user_checkup_threshold ?? undefined
              }
              canCheckUserAttendance={canCheckUserAttendance}
            />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}
