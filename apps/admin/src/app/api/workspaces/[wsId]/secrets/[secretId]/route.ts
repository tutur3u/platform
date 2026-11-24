import {
  canKeepWorkspaceSecretValueOnRename,
  getWorkspaceSecretTier,
} from '@tuturuuu/utils/workspace-secret-policy';
import { getWorkspaceSecretsBinding } from '@tuturuuu/utils/workspace-secrets/runtime';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeInfrastructureWorkspaceSecretsRequest } from '@/lib/infrastructure-admin-access';

import { canMutateInfrastructureSecret } from '@/lib/managed-cron-secret';
import {
  credentialWriteResponse,
  crossTierChangeResponse,
  isReservedProviderKeyName,
  reservedProviderKeyResponse,
} from '@/lib/workspace-secrets/credential-writes';

interface Params {
  params: Promise<{ secretId: string; wsId: string }>;
}

// Omitting `value` (or sending `keepValue: true`) keeps the stored value.
const secretUpdateSchema = z
  .object({
    keepValue: z.literal(true).optional(),
    name: z.string().trim().min(1).max(128).optional(),
    value: z.string().max(16_384).optional(),
  })
  .refine(
    (update) => update.name !== undefined || update.value !== undefined,
    'No updates provided'
  )
  .refine(
    (update) => !(update.keepValue && update.value !== undefined),
    'keepValue cannot be combined with value'
  );

export async function PUT(req: Request, { params }: Params) {
  const { secretId, wsId } = await params;
  const auth = await authorizeInfrastructureWorkspaceSecretsRequest(req);
  if (!auth.ok) return auth.response;

  const parsed = secretUpdateSchema.safeParse(
    await req.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.flatten(), message: 'Invalid input' },
      { status: 400 }
    );
  }

  const { data: existingSecret, error: existingError } = await auth.sbAdmin
    .from('workspace_secrets')
    .select('name, value_rev')
    .eq('id', secretId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { message: 'Error loading workspace API config' },
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
    isReservedProviderKeyName(existingSecret.name) ||
    isReservedProviderKeyName(parsed.data.name)
  ) {
    return reservedProviderKeyResponse();
  }

  if (
    !(await canMutateInfrastructureSecret(
      auth,
      existingSecret.name,
      parsed.data.name
    ))
  ) {
    return NextResponse.json(
      { message: 'Only Tuturuuu employees can change this workspace secret.' },
      { status: 403 }
    );
  }

  // With the workspace secrets Worker bound, credentials are re-encrypted
  // there: a new value is a put, and a kept value under a new name is a
  // rename that re-seals it for that name.
  const credentials = getWorkspaceSecretsBinding();
  const nextName = parsed.data.name ?? existingSecret.name;
  const fromCredential =
    getWorkspaceSecretTier(existingSecret.name) === 'credential';
  const toCredential = getWorkspaceSecretTier(nextName) === 'credential';
  if (credentials && (fromCredential || toCredential)) {
    if (fromCredential !== toCredential) return crossTierChangeResponse();
    const write = {
      expectedValueRev: existingSecret.value_rev,
      requestId: crypto.randomUUID(),
      secretId,
      wsId,
    };
    if (parsed.data.value !== undefined) {
      return credentialWriteResponse(
        await credentials.put({
          ...write,
          name: nextName,
          value: parsed.data.value,
        })
      );
    }
    if (nextName === existingSecret.name.trim()) {
      return NextResponse.json({ message: 'success' });
    }
    return credentialWriteResponse(
      await credentials.rename({
        ...write,
        fromName: existingSecret.name,
        toName: nextName,
      })
    );
  }

  const { keepValue: _keepValue, ...update } = parsed.data;
  if (
    update.value === undefined &&
    update.name !== undefined &&
    !canKeepWorkspaceSecretValueOnRename(existingSecret.name, update.name)
  ) {
    return NextResponse.json(
      { message: 'Enter a new value to move this secret to that name.' },
      { status: 400 }
    );
  }

  // A kept value is renamed only if the row still has the name the guard
  // checked, so a concurrent rename cannot expose a hidden value.
  const keepsValue = update.value === undefined;
  let query = auth.sbAdmin
    .from('workspace_secrets')
    .update(update)
    .eq('id', secretId)
    .eq('ws_id', wsId);
  if (keepsValue) query = query.eq('name', existingSecret.name);
  const { data, error } = await query.select('id').maybeSingle();

  if (error) {
    console.error('Error updating infrastructure workspace secret:', error);
    return NextResponse.json(
      { message: 'Error updating workspace API config' },
      { status: 500 }
    );
  }
  if (!data) {
    return keepsValue
      ? NextResponse.json(
          { message: 'Workspace secret changed; reload and try again.' },
          { status: 409 }
        )
      : NextResponse.json(
          { message: 'Workspace secret not found' },
          { status: 404 }
        );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const { secretId, wsId } = await params;
  const auth = await authorizeInfrastructureWorkspaceSecretsRequest(req);
  if (!auth.ok) return auth.response;

  const { data: existingSecret, error: existingError } = await auth.sbAdmin
    .from('workspace_secrets')
    .select('name')
    .eq('id', secretId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { message: 'Error loading workspace API config' },
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

  if (!(await canMutateInfrastructureSecret(auth, existingSecret.name))) {
    return NextResponse.json(
      { message: 'Only Tuturuuu employees can change this workspace secret.' },
      { status: 403 }
    );
  }

  const { data, error } = await auth.sbAdmin
    .from('workspace_secrets')
    .delete()
    .eq('id', secretId)
    .eq('ws_id', wsId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Error deleting infrastructure workspace secret:', error);
    return NextResponse.json(
      { message: 'Error deleting workspace API config' },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json(
      { message: 'Workspace secret not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
