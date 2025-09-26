import { createClient } from '@tuturuuu/supabase/next/server';
import type { GuestUserLead } from '@tuturuuu/types/primitives/GuestUserLead';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import { getGuestLeadColumns } from './columns';
import { GuestLeadSettingsForm } from './settings-form';
import { Button } from '@tuturuuu/ui/button';
import { Settings } from '@tuturuuu/ui/icons';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';

export const metadata: Metadata = {
  title: 'Guest User Leads',
  description:
    'Manage guest user leads and follow-up emails in your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q: string;
    page: string;
    pageSize: string;
  }>;
}

export default async function GuestUserLeadsPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations();
  const { wsId: id } = await params;
  const searchParamsResolved = await searchParams;
  const workspace = await getWorkspace(id);
  const wsId = workspace.id;
  const { data, count } = await getData(wsId, searchParamsResolved);

  // const user = await getCurrentUser(true);
  // const wsUser = await getWorkspaceUser(wsId, user?.id!);

  const settingsRow = await getWorkspaceSettings(wsId);

  return (
    <>
      <FeatureSummary
        pluralTitle={t('users.guest_leads.plural')}
        singularTitle={t('users.guest_leads.singular')}
        description={t('users.guest_leads.description')}
        settingsData={settingsRow ? settingsRow : undefined}
        settingsForm={
          <GuestLeadSettingsForm
            wsId={wsId}
            data={settingsRow ?? undefined}
          />
        }
        settingsTrigger={
          !settingsRow?.guest_user_checkup_threshold ? (
            <Button
              size="xs"
              className="w-full md:w-fit border border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/15"
              title={t('users.guest_leads.create_settings_tooltip')}
            >
              <Settings className="h-4 w-4" />
              {t('users.guest_leads.create_settings')}
            </Button>
          ) : undefined
        }
        settingsTitle={t('common.settings')}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={data}
        columnGenerator={getGuestLeadColumns}
        namespace="guest-lead-data-table"
        count={count}
        defaultVisibility={{
          id: false,
          created_at: false,
        }}
      />
    </>
  );
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = await createClient();

  // Get workspace settings to check threshold
  const { data: settings } = await supabase
    .from('workspace_settings')
    .select('guest_user_checkup_threshold')
    .eq('ws_id', wsId)
    .maybeSingle();

  const threshold = settings?.guest_user_checkup_threshold;

  if (!threshold) {
    // Return empty data if no threshold is set
    return { data: [] as GuestUserLead[], count: 0 };
  }

  // First, get all workspace users
  let userQueryBuilder = supabase
    .from('workspace_users')
    .select(`
      id,
      full_name,
      email,
      phone,
      gender,
      created_at,
      workspace_user_groups_users!inner(
        workspace_user_groups!inner(id, name, is_guest)
      )
    `)
    .eq('ws_id', wsId)
    .eq('archived', false)
    .eq('workspace_user_groups_users.workspace_user_groups.is_guest', true);

  // Add search functionality
  if (q) {
    userQueryBuilder = userQueryBuilder.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data: workspaceUsers, error: usersError } = await userQueryBuilder;

  if (usersError) throw usersError;

  if (!workspaceUsers || workspaceUsers.length === 0) {
    return { data: [] as GuestUserLead[], count: 0 };
  }

  // Limit concurrent operations to prevent stack overflow
  const BATCH_SIZE = 50;
  const eligibleUsers = [];
  
  // Process users in batches to avoid stack overflow
  for (let batchStart = 0; batchStart < workspaceUsers.length; batchStart += BATCH_SIZE) {
    const batch = workspaceUsers.slice(batchStart, batchStart + BATCH_SIZE);
    const batchUserIds = batch.map(user => user.id);

    // Get lead generation data for this batch
    const { data: batchLeadGenData, error: leadGenError } = await supabase
      .from('guest_users_lead_generation')
      .select('user_id')
      .eq('ws_id', wsId)
      .in('user_id', batchUserIds);

    if (leadGenError) throw leadGenError;

    const batchUsersWithLeads = new Set(batchLeadGenData?.map(lead => lead.user_id) || []);

    // Process each user in this batch
    for (const user of batch) {
      // Skip if user already has lead generation record
      if (batchUsersWithLeads.has(user.id)) continue;

      try {
        // Check if user is actually a guest
        const { data: isGuest, error: guestError } = await supabase.rpc('is_user_guest', {
          user_uuid: user.id,
        });
        
        if (guestError || !isGuest) continue;

        // Get attendance count
        const { count: attendanceCount, error: attendanceError } = await supabase
          .from('user_group_attendance')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .in('status', ['PRESENT', 'LATE']);

        if (attendanceError) continue;
        
        // Only include users who meet the attendance threshold
        if ((attendanceCount || 0) >= threshold) {
          eligibleUsers.push({
            id: user.id,
            full_name: user.full_name,
            email: user.email,
            phone: user.phone,
            gender: user.gender,
            created_at: user.created_at,
            attendance_count: attendanceCount || 0,
            workspace_user_groups_users: user.workspace_user_groups_users,
          });
        }
      } catch (error) {
        // Skip users that cause errors
        console.error(`Error processing user ${user.id}:`, error);
        continue;
      }
    }
  }

  // Apply pagination to the filtered results
  const totalCount = eligibleUsers.length;
  const parsedPage = parseInt(page, 10);
  const parsedSize = parseInt(pageSize, 10);
  const start = (parsedPage - 1) * parsedSize;
  const end = start + parsedSize;
  const paginatedUsers = eligibleUsers.slice(start, end);

  // Transform the data to match our GuestUserLead interface
  const transformedData: GuestUserLead[] = paginatedUsers.map((user: any) => {
    const userGroup = user.workspace_user_groups_users?.[0]?.workspace_user_groups;
    return {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      gender: user.gender,
      attendance_count: user.attendance_count,
      group_id: userGroup?.id || null,
      group_name: userGroup?.name || null,
      has_lead_generation: false, // These are all users without lead generation records
      created_at: user.created_at,
    };
  });

  return { data: transformedData, count: totalCount };
}

async function getWorkspaceSettings(wsId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('workspace_settings')
    .select('guest_user_checkup_threshold')
    .eq('ws_id', wsId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
