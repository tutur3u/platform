import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { AIModelUI } from '@tuturuuu/types';
import { type NextRequest, NextResponse } from 'next/server';
import { requireHiveAccess, serverLogger, withHiveRoute } from '../../_shared';

const ROUTE = '/api/v1/hive/ai/models';

const PUBLIC_MODEL_COLUMNS = [
  'context_window',
  'description',
  'id',
  'is_enabled',
  'name',
  'provider',
  'tags',
  'type',
].join(', ');

type HiveAiModelRow = {
  context_window?: number | null;
  description?: string | null;
  id: string;
  is_enabled?: boolean | null;
  name?: string | null;
  provider?: string | null;
  tags?: string[] | null;
};

function mapModel(row: HiveAiModelRow): AIModelUI {
  return {
    context: row.context_window ?? undefined,
    description: row.description ?? undefined,
    disabled: row.is_enabled === false,
    label: row.name?.trim() || row.id.split('/').slice(1).join('/') || row.id,
    provider: row.provider || row.id.split('/')[0] || 'unknown',
    tags: Array.isArray(row.tags) ? row.tags : undefined,
    value: row.id,
  };
}

export async function GET(request: NextRequest) {
  return withHiveRoute(request, ROUTE, async () => {
    const result = await requireHiveAccess(request);
    if (!result.ok) return result.response;

    const enabled = request.nextUrl.searchParams.get('enabled') !== 'false';
    const type = request.nextUrl.searchParams.get('type') ?? 'language';
    const sbAdmin = await createAdminClient({ noCookie: true });
    const privateDb = sbAdmin.schema('private');

    let query = privateDb
      .from('ai_gateway_models')
      .select(PUBLIC_MODEL_COLUMNS)
      .order('provider')
      .order('name');

    if (type !== 'all') {
      query = query.eq('type', type);
    }

    if (enabled) {
      query = query.eq('is_enabled', true);
    }

    const { data, error } = await query;

    if (error) {
      serverLogger.error('Failed to list Hive AI models', {
        error: error.message,
      });
      return NextResponse.json(
        { error: 'Failed to list AI models' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      models: ((data ?? []) as unknown as HiveAiModelRow[]).map(mapModel),
    });
  });
}
