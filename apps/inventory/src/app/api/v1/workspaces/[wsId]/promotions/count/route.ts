import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { validateWorkspaceApiKey } from '@/lib/workspace-api-key';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId } = await params;

  const apiKey = (await headers()).get('API_KEY');
  return apiKey
    ? getDataWithApiKey({ wsId, apiKey })
    : getDataFromSession({ request, wsId });
}

async function getDataWithApiKey({
  wsId,
  apiKey,
}: {
  wsId: string;
  apiKey: string;
}) {
  const sbAdmin = await createAdminClient();
  const privateDb = sbAdmin.schema('private');

  const apiCheckQuery = validateWorkspaceApiKey(wsId, apiKey);

  const mainQuery = privateDb
    .from('workspace_promotions')
    .select('count()')
    .eq('ws_id', wsId)
    .single();

  const [apiCheck, response] = await Promise.all([apiCheckQuery, mainQuery]);

  if (!apiCheck) {
    return NextResponse.json({ message: 'Invalid API key' }, { status: 401 });
  }

  const { data, error } = response;

  if (error) {
    console.error('Error fetching promotions count:', error);
    return NextResponse.json(
      { message: 'Error fetching workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json(data?.count || 0);
}

async function getDataFromSession({
  request,
  wsId,
}: {
  request: Request;
  wsId: string;
}) {
  const authorization = await authorizeInventoryWorkspace(request, wsId);
  if (!authorization.ok) return authorization.response;
  const { permissions } = authorization.value;

  const sbAdmin = await createAdminClient();
  const privateDb = sbAdmin.schema('private');

  const { data, error } = await privateDb
    .from('workspace_promotions')
    .select('count()')
    .eq('ws_id', permissions.wsId)
    .single();

  if (error) {
    console.error('Error fetching promotions count:', error);
    return NextResponse.json(
      { message: 'Error fetching workspace users' },
      { status: 500 }
    );
  }

  return NextResponse.json(data?.count || 0);
}
