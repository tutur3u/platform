import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeInfrastructureWorkspaceSecretsRequest } from '@/lib/infrastructure-admin-access';

import { canMutateInfrastructureSecret } from '@/lib/managed-cron-secret';

interface Params {
  params: Promise<{ secretId: string; wsId: string }>;
}

const secretUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(128).optional(),
    value: z.string().max(16_384).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'No updates provided');

export async function PUT(req: Request, { params }: Params) {
  const { secretId, wsId } = await params;
  const auth = await authorizeInfrastructureWorkspaceSecretsRequest();
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
      { message: 'Only Tuturuuu employees can enable managed cron jobs.' },
      { status: 403 }
    );
  }

  const { data, error } = await auth.sbAdmin
    .from('workspace_secrets')
    .update(parsed.data)
    .eq('id', secretId)
    .eq('ws_id', wsId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Error updating infrastructure workspace secret:', error);
    return NextResponse.json(
      { message: 'Error updating workspace API config' },
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

export async function DELETE(_: Request, { params }: Params) {
  const { secretId, wsId } = await params;
  const auth = await authorizeInfrastructureWorkspaceSecretsRequest();
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
      { message: 'Only Tuturuuu employees can disable managed cron jobs.' },
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
