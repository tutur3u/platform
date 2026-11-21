import { connection, NextResponse } from 'next/server';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';
import {
  parseAlerts,
  perfFactoryRecords,
} from '@/lib/observability-health/alerts';

// Open and recently resolved SLO burn alerts for Admin and the Perf Factory
// intake. Mastermind fleet sync reads the same RPC from apps/web.
// Read-only; callers authenticate as a root member with view_infrastructure,
// by session or bearer token.
export async function GET(request: Request) {
  await connection();
  const access = await authorizeInfrastructureAdminRequest(
    'view_infrastructure',
    true,
    request
  );
  if (!access.ok) return access.response;

  const { data, error } = await access.sbAdmin
    .schema('private')
    .rpc('list_observability_alerts', { p_limit: 200 });
  const alerts = error ? null : parseAlerts(data);
  if (!alerts) {
    console.error('Observability alerts unavailable');
    return NextResponse.json(
      { error: 'Alerts unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  return NextResponse.json(
    {
      alerts,
      regressions: perfFactoryRecords(alerts, new Date().toISOString()),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
