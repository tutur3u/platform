import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { validateWorkspaceApiKey } from '@/lib/workspace-api-key';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId: id } = await params;
  const apiKey = (await headers()).get('API_KEY');

  if (apiKey) {
    return getDataWithApiKey({
      wsId: await normalizeWorkspaceId(id),
      apiKey,
    });
  }

  return getDataFromSession({ request, wsId: id });
}

async function getDataWithApiKey({
  wsId,
  apiKey,
}: {
  wsId: string;
  apiKey: string;
}) {
  const sbAdmin = await createAdminClient();

  const apiCheckQuery = validateWorkspaceApiKey(wsId, apiKey);

  const mainQuery = sbAdmin
    .from('finance_invoices')
    .select('count()')
    .eq('ws_id', wsId)
    .single();

  const [apiCheck, response] = await Promise.all([apiCheckQuery, mainQuery]);

  if (!apiCheck) {
    return NextResponse.json({ message: 'Invalid API key' }, { status: 401 });
  }

  const { data, error } = response;

  if (error) {
    console.error('Error fetching invoice count with API key:', error);
    return NextResponse.json(
      { message: 'Error fetching workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json(data?.count || 0);
}

async function getDataFromSession({
  request,
  wsId: rawWsId,
}: {
  request: Request;
  wsId: string;
}) {
  const access = await getFinanceRouteContext(
    request,
    rawWsId,
    await resolveFinanceRouteAuthContext(request)
  );

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId: wsId, permissions, sbAdmin } = access.context;
  const { withoutPermission } = permissions;

  if (withoutPermission('view_invoices')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const { data, error } = await sbAdmin
    .from('finance_invoices')
    .select('count()')
    .eq('ws_id', wsId)
    .single();

  if (error) {
    console.error('Error fetching invoice count:', error);
    return NextResponse.json(
      { message: 'Error fetching workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json(data?.count || 0);
}
