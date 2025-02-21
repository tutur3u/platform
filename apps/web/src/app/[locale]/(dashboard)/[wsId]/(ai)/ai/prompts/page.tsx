import AIPromptsTable from './table';
import { verifyHasSecrets } from '@/lib/workspace-helper';
import { createClient } from '@tutur3u/supabase/next/server';
import { AIPrompt } from '@tutur3u/types/db';

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

export default async function WorkspaceAIPromptsPage({
  params,
  searchParams,
}: Props) {
  const { wsId } = await params;
  await verifyHasSecrets(wsId, ['ENABLE_AI'], `/${wsId}`);

  const { data, count } = await getData(wsId, await searchParams);
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
  const supabase = await createClient();

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
