import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { connection, NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

async function getEmailStats(wsId: string) {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.rpc('get_email_stats', {
    end_date: undefined,
    filter_ws_id: wsId,
    start_date: undefined,
  });

  if (error) {
    console.error('[SettingsDialogEmailAudit] Failed to load stats', error);
    return { failed: 0, rateLimited: 0, sent: 0, total: 0 };
  }

  return {
    failed: Number(data?.[0]?.failed_count || 0),
    rateLimited: Number(data?.[0]?.rate_limited_count || 0),
    sent: Number(data?.[0]?.sent_count || 0),
    total: Number(data?.[0]?.total_count || 0),
  };
}

export async function GET(_request: Request, { params }: Params) {
  await connection();

  const { wsId } = await params;
  const permissions = await getPermissions({ wsId });

  if (!permissions?.containsPermission('view_infrastructure')) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const supabase = await createAdminClient();
  const [stats, auditResult] = await Promise.all([
    getEmailStats(wsId),
    supabase
      .from('email_audit')
      .select(
        'id, subject, status, provider, template_type, source_email, created_at',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .limit(25),
  ]);

  if (auditResult.error) {
    console.error(
      '[SettingsDialogEmailAudit] Failed to load audit rows',
      auditResult.error
    );
    return NextResponse.json(
      { message: 'Failed to load email audit rows' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    count: auditResult.count ?? 0,
    data: auditResult.data ?? [],
    stats,
  });
}
