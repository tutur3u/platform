import { boundAuditLimit } from '@tuturuuu/feature-flags';
import { connection, NextResponse } from 'next/server';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';
import {
  asPrivateRpcAdmin,
  readPlatformFeatureFlagAudit,
} from '@/lib/feature-flags/platform-feature-flag-store';

const OPERATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  await connection();
  const access = await authorizeInfrastructureAdminRequest(
    'view_infrastructure',
    true,
    request
  );
  if (!access.ok) return access.response;
  const url = new URL(request.url);
  const limit = boundAuditLimit(url.searchParams.get('limit'));
  if (limit === null) {
    return NextResponse.json({ error: 'invalid_limit' }, { status: 400 });
  }
  const operationId = url.searchParams.get('operationId');
  if (operationId && !OPERATION_ID.test(operationId)) {
    return NextResponse.json({ error: 'invalid_operation' }, { status: 400 });
  }
  const before = url.searchParams.get('before');
  if (before && Number.isNaN(Date.parse(before))) {
    return NextResponse.json({ error: 'invalid_before' }, { status: 400 });
  }
  const read = await readPlatformFeatureFlagAudit({
    actorId: access.user.id,
    admin: asPrivateRpcAdmin(access.sbAdmin),
    before,
    limit,
    operationId,
  });
  if (read.status === 'denied') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (read.status !== 'ready') {
    return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 });
  }
  return NextResponse.json({ rows: read.rows });
}
