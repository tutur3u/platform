import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceAIExecution } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { type NextRequest, NextResponse } from 'next/server';

export function createPOST({
  getLast30DaysStats,
  getAllTimeStats,
}: {
  getLast30DaysStats: (wsId: string) => Promise<{
    summary: any;
    dailyStats: any[];
    modelStats: any[];
  }>;
  getAllTimeStats: (wsId: string) => Promise<{
    summary: any;
    dailyStats: any[];
    modelStats: any[];
  }>;
}) {
  // Higher-order function that returns the actual request handler
  return async function handler(req: NextRequest): Promise<Response> {
    const sbAdmin = await createAdminClient();

    const {
      accessKey,
      query,
      configs = {
        wsId: ROOT_WORKSPACE_ID,
      },
    } = (await req.json()) as {
      accessKey?: {
        id: string;
        value: string;
      };
      query?: {
        q?: string;
        page?: string;
        pageSize?: string;
      };
      configs?: {
        wsId: string;
      };
    };

    try {
      if (!accessKey?.id || !accessKey?.value) {
        console.error('Missing accessId or accessKey');
        return new Response('Missing accessId or accessKey', { status: 400 });
      }

      const { error: apiKeyError } = await sbAdmin
        .from('workspace_api_keys')
        .select('id, scopes')
        .eq('ws_id', configs.wsId)
        .eq('id', accessKey.id)
        .eq('value', accessKey.value)
        .single();

      if (apiKeyError) {
        console.error('Invalid accessId or accessKey');
        return new Response('Invalid accessId or accessKey', { status: 400 });
      }

      const [executionData, analyticsData, allTimeStats] = await Promise.all([
        getData(configs.wsId, query || {}),
        getLast30DaysStats(configs.wsId),
        getAllTimeStats(configs.wsId),
      ]);

      return NextResponse.json({
        executionData,
        analyticsData,
        allTimeStats,
      });
    } catch (error) {
      if (error instanceof Error) {
        console.log(error.message);
        return NextResponse.json(
          {
            message: `## Edge API Failure\nCould not complete the request. Please view the **Stack trace** below.\n\`\`\`bash\n${error instanceof Error ? error.stack : 'Unknown error'}`,
          },
          {
            status: 500,
          }
        );
      }
      console.log(error);
      return new Response('Internal Server Error', { status: 500 });
    }
  };
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    retry = true,
  }: {
    q?: string | undefined;
    page?: string | undefined;
    pageSize?: string | undefined;
    retry?: boolean | undefined;
  }
) {
  const sbAdmin = await createAdminClient();
  const queryBuilder = sbAdmin
    .from('workspace_ai_executions')
    .select('*', { count: 'exact' })
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

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
    return getData(wsId, { q, pageSize, retry: false });
  }
  return { data, count } as {
    data: WorkspaceAIExecution[];
    count: number;
  };
}
