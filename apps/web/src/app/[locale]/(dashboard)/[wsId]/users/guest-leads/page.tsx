import { createClient } from '@tuturuuu/supabase/next/server';
import type { GuestUserLead } from '@tuturuuu/types/primitives/GuestUserLead';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CustomDataTable } from '@/components/custom-data-table';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { getGuestLeadColumns } from './columns';
import { GuestLeadHeader } from './header';

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
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const permissions = await getPermissions({ wsId });
        if (!permissions) notFound();
        const { containsPermission } = permissions;
        const canCreateLeadGenerations = containsPermission(
          'create_lead_generations'
        );
        if (!canCreateLeadGenerations) {
          notFound();
        }
        const searchParamsResolved = await searchParams;
        const { data, count } = await getData(wsId, searchParamsResolved);
        const settingsRow = await getWorkspaceSettings(wsId);
        return (
          <>
            <GuestLeadHeader
              settingsRow={settingsRow}
              wsId={wsId}
              canCreateLeadGenerations={canCreateLeadGenerations}
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
      }}
    </WorkspaceWrapper>
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
