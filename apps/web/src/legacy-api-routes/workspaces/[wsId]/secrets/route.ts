import { NextResponse } from 'next/server';
import {
  canMutateManagedCronEnableSecret,
  createManagedCronSecretAdminClient,
  isManagedCronEnableSecretName,
} from '@/lib/workspace-secrets/managed-cron';
import { getWorkspaceSecretsAccess } from './access';
import { workspaceSecretWriteSchema } from './schema';

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
    console.error('Error fetching workspace secrets', error);
    return NextResponse.json(
      { message: 'Error fetching workspace API configs' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: Params) {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { message: 'Malformed JSON payload' },
      { status: 400 }
    );
  }

  const parsed = workspaceSecretWriteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid workspace secret payload' },
      { status: 400 }
    );
  }
  const { name, value } = parsed.data;

  const { wsId } = await params;
  const access = await getWorkspaceSecretsAccess(wsId, req);

  if (!access.allowed) {
    return NextResponse.json(
      { message: access.message },
      { status: access.status }
    );
  }

  const touchesManagedCron = isManagedCronEnableSecretName(name);
  if (touchesManagedCron && !(await canMutateManagedCronEnableSecret(req))) {
    return NextResponse.json(
      { message: 'Only Tuturuuu employees can enable managed cron jobs.' },
      { status: 403 }
    );
  }

  const db = touchesManagedCron
    ? await createManagedCronSecretAdminClient()
    : access.db;
  const { error } = await db.from('workspace_secrets').insert({
    name,
    value,
    ws_id: access.resolvedWsId,
  });

  if (error) {
    console.error('Error creating workspace secret', error);
    return NextResponse.json(
      { message: 'Error creating workspace API config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
