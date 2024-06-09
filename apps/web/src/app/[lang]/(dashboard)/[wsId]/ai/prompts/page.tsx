import AIPromptsTable from './table';
import { verifyHasSecrets } from '@/lib/workspace-helper';
import { AIPrompt } from '@/types/db';
import { Database } from '@/types/supabase';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

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

export default async function WorkspaceAIPromptsPage({
  params: { wsId },
  searchParams,
}: Props) {
  await verifyHasSecrets(wsId, ['ENABLE_AI'], `/${wsId}`);

  const { data, count } = await getData(wsId, searchParams);
  return <AIPromptsTable wsId={wsId} data={data} count={count} />;
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase
    .from('workspace_ai_prompts')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('name', { ascending: true });

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: AIPrompt[]; count: number };
}
