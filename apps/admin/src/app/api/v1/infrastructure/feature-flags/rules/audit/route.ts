import { boundAuditLimit, isUuid } from '@tuturuuu/feature-flags';
import { connection, NextResponse } from 'next/server';
import {
  asPrivateRpcAdmin,
  readRuleAudit,
} from '@/lib/feature-flags/rule-store';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';

export async function GET(request: Request) {
  await connection();
  const access = await authorizeInfrastructureAdminRequest(
    ['view_infrastructure', 'manage_feature_flags'],
    true,
    request
  );
  if (!access.ok) return access.response;
  const params = new URL(request.url).searchParams;
  const limit = boundAuditLimit(params.get('limit'));
  const before = params.get('before');
  const beforeId = params.get('beforeId');
  if (
    limit === null ||
    (before !== null &&
      (!/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/.test(before) ||
        Number.isNaN(Date.parse(before)))) ||
    (beforeId !== null && (before === null || !isUuid(beforeId)))
  ) {
    return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
  }
  const result = await readRuleAudit({
    actorId: access.user.id,
    admin: asPrivateRpcAdmin(access.sbAdmin),
    before,
    beforeId,
    limit,
  });
  return NextResponse.json(result.body, { status: result.status });
}
