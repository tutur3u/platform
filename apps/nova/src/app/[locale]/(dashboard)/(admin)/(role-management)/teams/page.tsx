import { createClient } from '@tuturuuu/supabase/next/server';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import TeamClient from './client-page';
import { getTeamColumns } from './columns';

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
}: {
  q?: string;
  page?: string;
  pageSize?: string;
  retry?: boolean;
} = {}) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('nova_teams')
    .select('*, nova_team_members(count), nova_team_emails(count)', {
      count: 'exact',
    })
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;

  if (error) {
    if (!retry) throw error;
    return getTeamsData({ q, pageSize, retry: false });
  }

  const transformedData = data.map((team) => ({
    ...team,
    member_count: team.nova_team_members?.[0]?.count || 0,
    invitation_count: team.nova_team_emails?.[0]?.count || 0,
    nova_team_members: undefined,
    nova_team_emails: undefined,
  }));

  return {
    teamData: transformedData,
    teamCount: count,
  };
}
