import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  canMutateManagedCronEnableSecret,
  isManagedCronEnableSecretName,
} from '@/lib/workspace-secrets/managed-cron';
import { getWorkspaceSecretsAccess } from '../access';

interface Params {
  params: Promise<{
    wsId: string;
    secretId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  let data: { name?: string; value?: string };

  try {
    data = await req.json();
  } catch {
    return NextResponse.json(
      { message: 'Malformed JSON payload' },
      { status: 400 }
    );
  }

  const { wsId, secretId } = await params;
  const access = await getWorkspaceSecretsAccess(wsId, req);

  if (!access.allowed) {
    return NextResponse.json(
      { message: access.message },
      { status: access.status }
    );
  }

  const { data: existingSecret, error: existingError } = await access.db
    .from('workspace_secrets')
    .select('name')
    .eq('id', secretId)
    .eq('ws_id', access.resolvedWsId)
    .maybeSingle();

  if (existingError) {
    serverLogger.error(
      'Error loading workspace secret before update',
      existingError
    );
    return NextResponse.json(
      { message: 'Error updating workspace API config' },
      { status: 500 }
    );
  }

  if (!existingSecret) {
    return NextResponse.json(
      { message: 'Workspace secret not found' },
      { status: 404 }
    );
  }

  if (
    (isManagedCronEnableSecretName(existingSecret.name) ||
      isManagedCronEnableSecretName(data.name)) &&
    !(await canMutateManagedCronEnableSecret(req))
  ) {
    return NextResponse.json(
      { message: 'Only Tuturuuu employees can enable managed cron jobs.' },
      { status: 403 }
    );
  }

  const { error } = await access.db
    .from('workspace_secrets')
    .update(data)
    .eq('id', secretId)
    .eq('ws_id', access.resolvedWsId);

  if (error) {
    serverLogger.error('Error updating workspace secret', error);
    return NextResponse.json(
      { message: 'Error updating workspace API config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(request: Request, { params }: Params) {
  const { wsId, secretId } = await params;
  const access = await getWorkspaceSecretsAccess(wsId, request);

  if (!access.allowed) {
    return NextResponse.json(
      { message: access.message },
      { status: access.status }
    );
  }

  const { data: existingSecret, error: existingError } = await access.db
    .from('workspace_secrets')
    .select('name')
    .eq('id', secretId)
    .eq('ws_id', access.resolvedWsId)
    .maybeSingle();

  if (existingError) {
    serverLogger.error(
      'Error loading workspace secret before delete',
      existingError
    );
    return NextResponse.json(
      { message: 'Error deleting workspace API config' },
      { status: 500 }
    );
  }

  if (!existingSecret) {
    return NextResponse.json(
      { message: 'Workspace secret not found' },
      { status: 404 }
    );
  }

  if (
    isManagedCronEnableSecretName(existingSecret.name) &&
    !(await canMutateManagedCronEnableSecret(request))
  ) {
    return NextResponse.json(
      { message: 'Only Tuturuuu employees can disable managed cron jobs.' },
      { status: 403 }
    );
  }

  const { error } = await access.db
    .from('workspace_secrets')
    .delete()
    .eq('id', secretId)
    .eq('ws_id', access.resolvedWsId);

  if (error) {
    serverLogger.error('Error deleting workspace secret', error);
    return NextResponse.json(
      { message: 'Error deleting workspace API config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
