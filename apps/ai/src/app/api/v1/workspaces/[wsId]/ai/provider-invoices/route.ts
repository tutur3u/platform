import { connection } from 'next/server';
import { authorizeAiStudioWorkspaceRequest } from '@/lib/session-api';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const auth = await authorizeAiStudioWorkspaceRequest(
    (await params).wsId,
    'use_ai_studio'
  );
  if (!auth.ok) return auth.response;
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await auth.sbAdmin
      .schema('private')
      .rpc('get_external_provider_invoices', { p_ws_id: auth.workspace.id })
      .range(offset, offset + 499);
    if (error)
      return Response.json(
        { error: 'Provider invoices unavailable' },
        { status: 503 }
      );
    for (const { actor_id: _actor, ws_id: _workspace, ...row } of data ?? [])
      rows.push(row);
    if (!data || data.length < 500) break;
  }
  return Response.json(
    { currency: 'USD', rows },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
