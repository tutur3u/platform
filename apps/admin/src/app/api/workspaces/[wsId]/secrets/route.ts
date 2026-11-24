import {
  getWorkspaceSecretTier,
  toClientWorkspaceSecret,
} from '@tuturuuu/utils/workspace-secret-policy';
import { getWorkspaceSecretsBinding } from '@tuturuuu/utils/workspace-secrets/runtime';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  authorizeInfrastructureAdminRequest,
  authorizeInfrastructureWorkspaceSecretsRequest,
} from '@/lib/infrastructure-admin-access';

import { canMutateInfrastructureSecret } from '@/lib/managed-cron-secret';
import {
  credentialWriteResponse,
  isReservedProviderKeyName,
  reservedProviderKeyResponse,
} from '@/lib/workspace-secrets/credential-writes';

interface Params {
  params: Promise<{ wsId: string }>;
}

const secretSchema = z.object({
  name: z.string().trim().min(1).max(128),
  value: z.string().max(16_384),
});

export async function GET(request: Request, { params }: Params) {
  const admin = await authorizeInfrastructureAdminRequest(
    'view_infrastructure',
    true,
    request
  );
  if (!admin.ok) return admin.response;
  await connection();
  const { wsId } = await params;
  if (
    !admin.permissions?.containsPermission('manage_workspace_secrets') &&
    !admin.permissions?.containsPermission('manage_workspace_roles')
  ) {
    return NextResponse.json(
      { error: 'Infrastructure permission required' },
      { status: 403 }
    );
  }

  const { data, error } = await admin.sbAdmin
    .from('workspace_secrets')
    .select('*')
    .eq('ws_id', wsId)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching infrastructure workspace secrets:', error);
    return NextResponse.json(
      { message: 'Error fetching workspace API configs' },
      { status: 500 }
    );
  }

  return NextResponse.json((data ?? []).map(toClientWorkspaceSecret));
}

export async function POST(req: Request, { params }: Params) {
  const { wsId } = await params;
  const auth = await authorizeInfrastructureWorkspaceSecretsRequest(req);
  if (!auth.ok) return auth.response;

  const parsed = secretSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.flatten(), message: 'Invalid input' },
      { status: 400 }
    );
  }

  if (isReservedProviderKeyName(parsed.data.name)) {
    return reservedProviderKeyResponse();
  }

  if (!(await canMutateInfrastructureSecret(auth, parsed.data.name))) {
    return NextResponse.json(
      { message: 'Only Tuturuuu employees can change this workspace secret.' },
      { status: 403 }
    );
  }

  // With the workspace secrets Worker bound, a credential is encrypted there
  // and never written as plaintext.
  const credentials = getWorkspaceSecretsBinding();
  if (
    credentials &&
    getWorkspaceSecretTier(parsed.data.name) === 'credential'
  ) {
    return credentialWriteResponse(
      await credentials.put({
        name: parsed.data.name,
        requestId: crypto.randomUUID(),
        value: parsed.data.value,
        wsId,
      })
    );
  }

  const { error } = await auth.sbAdmin.from('workspace_secrets').insert({
    ...parsed.data,
    ws_id: wsId,
  });

  if (error) {
    console.error('Error creating infrastructure workspace secret:', error);
    return NextResponse.json(
      { message: 'Error creating workspace API config' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
