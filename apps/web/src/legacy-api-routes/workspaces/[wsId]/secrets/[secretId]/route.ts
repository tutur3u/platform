import {
  canKeepWorkspaceSecretValueOnRename,
  getWorkspaceSecretTier,
} from '@tuturuuu/utils/workspace-secret-policy';
import { getWorkspaceSecretsBinding } from '@tuturuuu/utils/workspace-secrets/runtime';
import { NextResponse } from 'next/server';
import {
  canMutateManagedCronEnableSecret,
  createManagedCronSecretAdminClient,
  isManagedCronEnableSecretName,
} from '@/lib/workspace-secrets/managed-cron';
import {
  credentialWriteResponse,
  crossTierChangeResponse,
  isReservedProviderKeyName,
  reservedProviderKeyResponse,
} from '@/lib/workspace-secrets/credential-writes';
import { getWorkspaceSecretsAccess } from '../access';
import { workspaceSecretUpdateSchema } from '../schema';

interface Params {
  params: Promise<{
    wsId: string;
    secretId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { message: 'Malformed JSON payload' },
      { status: 400 }
    );
  }

  const parsed = workspaceSecretUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid workspace secret payload' },
      { status: 400 }
    );
  }
  const { name } = parsed.data;
  const value = 'value' in parsed.data ? parsed.data.value : undefined;
  if (isReservedProviderKeyName(name)) return reservedProviderKeyResponse();

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
    .select('name, value_rev')
    .eq('id', secretId)
    .eq('ws_id', access.resolvedWsId)
    .maybeSingle();

  if (existingError) {
    console.error(
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
    value === undefined &&
    !canKeepWorkspaceSecretValueOnRename(existingSecret.name, name)
  ) {
    return NextResponse.json(
      { message: 'Enter a new value to move this secret to that name.' },
      { status: 400 }
    );
  }

  const touchesManagedCron =
    isManagedCronEnableSecretName(existingSecret.name) ||
    isManagedCronEnableSecretName(name);
  if (touchesManagedCron && !(await canMutateManagedCronEnableSecret(req))) {
    return NextResponse.json(
      { message: 'Only Tuturuuu employees can change this workspace secret.' },
      { status: 403 }
    );
  }

  if (isReservedProviderKeyName(existingSecret.name)) {
    return reservedProviderKeyResponse();
  }

  // With the workspace secrets Worker bound, credentials are re-encrypted
  // there: a new value is a put, and a kept value under a new name is a
  // rename that re-seals it for that name.
  const credentials = getWorkspaceSecretsBinding();
  const fromCredential =
    getWorkspaceSecretTier(existingSecret.name) === 'credential';
  const toCredential = getWorkspaceSecretTier(name) === 'credential';
  if (credentials && (fromCredential || toCredential)) {
    if (fromCredential !== toCredential) return crossTierChangeResponse();
    const write = {
      expectedValueRev: existingSecret.value_rev,
      requestId: crypto.randomUUID(),
      secretId,
      wsId: access.resolvedWsId,
    };
    if (value !== undefined) {
      return credentialWriteResponse(
        await credentials.put({ ...write, name, value })
      );
    }
    if (name === existingSecret.name.trim()) {
      return NextResponse.json({ message: 'success' });
    }
    return credentialWriteResponse(
      await credentials.rename({
        ...write,
        fromName: existingSecret.name,
        toName: name,
      })
    );
  }

  const db = touchesManagedCron
    ? await createManagedCronSecretAdminClient()
    : access.db;
  if (value === undefined) {
    // The rename guard checked `existingSecret.name`; matching it here makes a
    // concurrent rename fail instead of moving a hidden value under a visible
    // name.
    const { data: kept, error } = await db
      .from('workspace_secrets')
      .update({ name })
      .eq('id', secretId)
      .eq('ws_id', access.resolvedWsId)
      .eq('name', existingSecret.name)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('Error updating workspace secret', error);
      return NextResponse.json(
        { message: 'Error updating workspace API config' },
        { status: 500 }
      );
    }
    if (!kept) {
      return NextResponse.json(
        { message: 'Workspace secret changed; reload and try again.' },
        { status: 409 }
      );
    }

    return NextResponse.json({ message: 'success' });
  }

  const { error } = await db
    .from('workspace_secrets')
    .update({ name, value })
    .eq('id', secretId)
    .eq('ws_id', access.resolvedWsId);

  if (error) {
    console.error('Error updating workspace secret', error);
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
    console.error(
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

  if (isReservedProviderKeyName(existingSecret.name)) {
    return reservedProviderKeyResponse();
  }

  const touchesManagedCron = isManagedCronEnableSecretName(existingSecret.name);
  if (
    touchesManagedCron &&
    !(await canMutateManagedCronEnableSecret(request))
  ) {
    return NextResponse.json(
      { message: 'Only Tuturuuu employees can change this workspace secret.' },
      { status: 403 }
    );
  }

  const db = touchesManagedCron
    ? await createManagedCronSecretAdminClient()
    : access.db;
  const { error } = await db
    .from('workspace_secrets')
    .delete()
    .eq('id', secretId)
    .eq('ws_id', access.resolvedWsId);

  if (error) {
    console.error('Error deleting workspace secret', error);
    return NextResponse.json(
      { message: 'Error deleting workspace API config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
