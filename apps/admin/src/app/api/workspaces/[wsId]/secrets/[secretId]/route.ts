import { canKeepWorkspaceSecretValueOnRename } from '@tuturuuu/utils/workspace-secret-policy';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeInfrastructureWorkspaceSecretsRequest } from '@/lib/infrastructure-admin-access';

import { canMutateInfrastructureSecret } from '@/lib/managed-cron-secret';

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
