import { connection, type NextRequest } from 'next/server';
import { parseAiStudioDateRange } from '@/lib/observability';
import { authorizeAiStudioWorkspaceRequest } from '@/lib/session-api';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const auth = await authorizeAiStudioWorkspaceRequest(
    (await params).wsId,
    'use_ai_studio'
  );
  if (!auth.ok) return auth.response;
  const range = parseAiStudioDateRange(request.nextUrl);
  if (!range)
    return Response.json({ error: 'Invalid date range' }, { status: 400 });
  const { data, error } = await auth.sbAdmin
    .schema('private')
    .rpc('get_external_provider_costs', {
      p_ws_id: auth.workspace.id,
      p_from: range.from.toISOString(),
      p_to: range.to.toISOString(),
    });
  if (error) {
    console.error('Provider cost aggregation failed', { code: error.code });
    return Response.json(
      { error: 'Provider costs unavailable' },
      { status: 503 }
    );
  }
  return Response.json(
    { currency: 'USD', timezone: 'UTC', rows: data ?? [] },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
