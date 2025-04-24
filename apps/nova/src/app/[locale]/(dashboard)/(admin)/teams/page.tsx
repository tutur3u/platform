import TeamClient from './client-page';
import { getTeamColumns } from './columns';
import { CustomDataTable } from '@/components/custom-data-table';
import { createClient } from '@tuturuuu/supabase/next/server';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getTranslations } from 'next-intl/server';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
}

interface Props {
  searchParams: Promise<SearchParams>;
}

export default async function TeamsPage({ searchParams }: Props) {
  const t = await getTranslations();

  const { teamData, teamCount } = await getTeamsData(await searchParams);

  return (
    <div className="p-4 md:p-8">
      <FeatureSummary
        pluralTitle={t('teams.plural')}
        singularTitle={t('teams.singular')}
        description={t('teams.description')}
        createTitle={t('teams.create')}
        createDescription={t('teams.create_description')}
        form={<TeamClient />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        pageSize={100}
        data={teamData}
        columnGenerator={getTeamColumns}
        count={teamCount}
        defaultVisibility={{
          id: false,
        }}
      />
    </div>
  );
}

async function getTeamsData({
  q,
  page = '1',
  pageSize = '100',
  retry = true,
}: { q?: string; page?: string; pageSize?: string; retry?: boolean } = {}) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('nova_teams')
    .select(`*, nova_team_members(count)`, {
      count: 'exact',
    })
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;

  if (error) {
    console.error('Error fetching teams:', error);
    if (!retry) throw error;
    return getTeamsData({ q, pageSize, retry: false });
  }

  //Get all team IDs
  const teamIds = data.map((team) => team.id);

  // Get invitation counts for all teams at once
  const { data: allInvites, error: inviteError } = await supabase
    .from('nova_team_emails')
    .select('team_id')
    .in('team_id', teamIds);

  if (inviteError) {
    console.error('Error fetching invitation counts:', inviteError);
  }

  const invitationCountMap: Record<string, number> = {};
  if (allInvites) {
    allInvites.forEach((invite) => {
      invitationCountMap[invite.team_id] =
        (invitationCountMap[invite.team_id] || 0) + 1;
    });
  }

  const transformedData = data.map((team) => {
    return {
      ...team,
      member_count: team.nova_team_members?.[0]?.count || 0,
      invitation_count: invitationCountMap[team.id] || 0,
      nova_team_members: undefined,
    };
  });

  return {
    teamData: transformedData,
    teamCount: count,
  };
}
