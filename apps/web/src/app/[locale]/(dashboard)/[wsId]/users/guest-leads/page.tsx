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
          <GuestLeadSettingsForm wsId={wsId} data={settingsRow ?? undefined} />
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

  // Use the optimized RPC function instead of N+1 queries
  const { data: results, error } = await supabase.rpc('get_guest_user_leads', {
    p_ws_id: wsId,
    p_threshold: threshold,
    p_search: q || undefined,
    p_page: parseInt(page, 10),
    p_page_size: parseInt(pageSize, 10),
  });

  if (error) throw error;

  if (!results || results.length === 0) {
    return { data: [] as GuestUserLead[], count: 0 };
  }

  // Transform the data to match our GuestUserLead interface
  const transformedData: GuestUserLead[] = results.map((user) => ({
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    gender: user.gender,
    attendance_count: user.attendance_count,
    group_id: user.group_id,
    group_name: user.group_name,
    has_lead_generation: user.has_lead_generation,
    created_at: user.created_at,
  }));

  // Get total count from the first result (all rows have the same total_count)
  const totalCount = results[0]?.total_count || 0;

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
