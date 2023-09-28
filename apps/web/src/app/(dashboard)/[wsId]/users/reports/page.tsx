import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/types/supabase';
import { cookies } from 'next/headers';
import { DataTable } from '../list/data-table';
import { WorkspaceSecret } from '@/types/primitives/WorkspaceSecret';
import { userReportColumns } from '@/data/columns/user-reports';

interface Props {
  params: {
    wsId: string;
  };
  searchParams: {
    q: string;
    page: string;
    pageSize: string;
  };
}

export default async function WorkspaceUserReportsPage({
  params: { wsId },
  searchParams,
}: Props) {
  const { data, count } = await getReports(wsId, searchParams);

  return (
    <DataTable
      data={data}
      columns={userReportColumns}
      count={count}
      defaultVisibility={{
        id: false,
        user_id: false,
        created_at: false,
      }}
    />
  );
}

async function getSecrets(wsId: string) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase
    .from('workspace_secrets')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .in('name', [
      'EXTERNAL_USER_REPORTS_FETCH_API',
      'EXTERNAL_USER_REPORTS_API_KEY',
    ]);

  const { data, error, count } = await queryBuilder;
  if (error) throw error;
  if (count !== 2) throw new Error('Missing secrets');

  return { data, count } as { data: WorkspaceSecret[] };
}

async function getReports(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  try {
    const { data: secrets } = await getSecrets(wsId);

    const fetchApi = secrets.find(
      (secret) => secret.name === 'EXTERNAL_USER_REPORTS_FETCH_API'
    )?.value;

    const apiKey = secrets.find(
      (secret) => secret.name === 'EXTERNAL_USER_REPORTS_API_KEY'
    )?.value;

    if (!fetchApi || !apiKey) throw new Error('Missing secrets');

    const from = (parseInt(page) - 1) * parseInt(pageSize);
    const fetchUrl = `${fetchApi}?${
      q ? `search=${q}&` : ''
    }from=${from}&limit=${pageSize}`;

    const response = await fetch(fetchUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'ttr-api-key': apiKey,
      },
    });

    if (!response.ok) throw new Error('Failed to fetch');

    const { reports: data, count } = await response.json();

    return { data, count } as { data: any[]; count: number };
  } catch (error) {
    console.error(error);
    return { data: [], count: 0 };
  }
}
