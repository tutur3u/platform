import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  canMutateManagedCronEnableSecret,
  isManagedCronEnableSecretName,
} from '@/lib/workspace-secrets/managed-cron';
import { getWorkspaceSecretsAccess } from './access';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId } = await params;
  const access = await getWorkspaceSecretsAccess(wsId, request);

  if (!access.allowed) {
    return NextResponse.json(
      { message: access.message },
      { status: access.status }
    );
  }

  const { data, error } = await access.db
    .from('workspace_secrets')
    .select('*')
    .eq('ws_id', access.resolvedWsId)
    .order('name', { ascending: true });

  if (error) {
    serverLogger.error('Error fetching workspace secrets', error);
    return NextResponse.json(
      { message: 'Error fetching workspace API configs' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  let data: { name?: string; value?: string };

  try {
    data = await req.json();
  } catch {
    return NextResponse.json(
      { message: 'Malformed JSON payload' },
      { status: 400 }
    );
  }

  const { wsId } = await params;
  const access = await getWorkspaceSecretsAccess(wsId, req);

  if (!access.allowed) {
    return NextResponse.json(
      { message: access.message },
      { status: access.status }
    );
  }

  if (
    isManagedCronEnableSecretName(data.name) &&
    !(await canMutateManagedCronEnableSecret(req))
  ) {
    return NextResponse.json(
      { message: 'Only Tuturuuu employees can enable managed cron jobs.' },
      { status: 403 }
    );
  }

  const { error } = await access.db.from('workspace_secrets').insert({
    ...data,
    ws_id: access.resolvedWsId,
  });

  if (error) {
    serverLogger.error('Error creating workspace secret', error);
    return NextResponse.json(
      { message: 'Error creating workspace API config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
