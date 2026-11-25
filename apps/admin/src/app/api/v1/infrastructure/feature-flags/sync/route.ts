import { asPrivateRpcAdmin } from '@tuturuuu/feature-flags';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { syncFeatureFlagDefinitions } from '@/lib/feature-flags/definition-sync';
import { hasFeatureFlagWriteIntent } from '@/lib/feature-flags/write-intent';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';

const bodySchema = z.object({
  acknowledgeWidening: z.boolean().optional(),
});

export async function POST(request: Request) {
  await connection();
  const access = await authorizeInfrastructureAdminRequest(
    'manage_feature_flags',
    true,
    request
  );
  if (!access.ok) return access.response;
  if (!hasFeatureFlagWriteIntent(request)) {
    return NextResponse.json({ error: 'mutation_forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = request.body === null ? {} : await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_operation' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_operation' }, { status: 400 });
  }

  const result = await syncFeatureFlagDefinitions(
    asPrivateRpcAdmin(access.sbAdmin),
    parsed.data.acknowledgeWidening ?? false
  );
  if (result.status === 'widening') {
    return NextResponse.json(
      { error: 'feature_flag_definition_widens_control' },
      { status: 409 }
    );
  }
  if (result.status === 'unavailable') {
    return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 });
  }
  return NextResponse.json(result.summary);
}
