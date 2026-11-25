import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  CI_ALERT_TOKEN_HEADER,
  CiAlertSchema,
  isAuthorizedCiAlertToken,
  readCiAlertConfig,
  syncCiAlert,
} from '@tuturuuu/tasks-api/server/ci-alerts/handler';
import { NextResponse } from 'next/server';

// Repository workflows report failing alerts here instead of opening public
// GitHub issues. See apps/docs/build/devops/ci-alert-tasks.mdx.
export async function POST(request: Request) {
  const config = readCiAlertConfig(process.env);
  if (!config)
    return NextResponse.json(
      { error: 'CI alerts are not configured' },
      { status: 503 }
    );
  if (
    !(await isAuthorizedCiAlertToken(
      request.headers.get(CI_ALERT_TOKEN_HEADER),
      config.tokens
    ))
  )
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = CiAlertSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid alert' }, { status: 400 });

  try {
    // No session reaches this route; writes are attributed to the configured
    // alert actor.
    const admin = await createAdminClient({
      noCookie: true,
      auditActorId: config.actorId,
    });
    const result = await syncCiAlert(admin, config, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    console.error('CI alert sync failed:', error);
    return NextResponse.json(
      { error: 'Failed to sync the alert' },
      { status: 500 }
    );
  }
}
