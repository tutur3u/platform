import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { verifySecret } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserGroupRoutePermissions } from '../../../../../lib/user-groups/route-auth';
import { resolveUserGroupRouteWorkspaceId } from '../../../../../lib/user-groups/route-helpers';

const DeliveryActionSchema = z.object({
  action: z.enum(['preview', 'test', 'send', 'retry', 'cancel']),
});

interface Params {
  params: Promise<{ reportId: string; wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { reportId, wsId: rawWsId } = await params;
    const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
    const permissions = await getUserGroupRoutePermissions(wsId, request);
    if (!permissions?.containsPermission('view_user_groups_reports')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }
    const admin = await createAdminClient();
    const db = admin.schema('private');
    const report = await db
      .from('external_user_monthly_reports_workspace_view')
      .select(
        'id, user_email, delivery_status, delivered_at, delivery_requested_at, last_delivery_error'
      )
      .eq('id', reportId)
      .eq('user_ws_id', wsId)
      .maybeSingle();
    if (report.error) throw report.error;
    if (!report.data)
      return NextResponse.json(
        { message: 'Report not found' },
        { status: 404 }
      );
    const queue = await db
      .from('user_report_email_queue')
      .select(
        'id, status, recipient_email, delivery_kind, attempt_count, next_attempt_at, sent_at, last_error, provider_message_id'
      )
      .eq('report_id', reportId)
      .eq('ws_id', wsId)
      .maybeSingle();
    if (queue.error) throw queue.error;
    const attempts = queue.data
      ? await db
          .from('user_report_email_attempts')
          .select(
            'id, status, attempted_at, error_message, provider_message_id'
          )
          .eq('queue_id', queue.data.id)
          .order('attempted_at', { ascending: false })
          .limit(20)
      : { data: [], error: null };
    if (attempts.error) throw attempts.error;
    return NextResponse.json(
      { report: report.data, queue: queue.data, attempts: attempts.data },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    console.error('Periodic report delivery diagnostics failed', { error });
    return NextResponse.json(
      { message: 'Unable to load delivery status' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const parsed = DeliveryActionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid delivery action', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { reportId, wsId: rawWsId } = await params;
    const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
    const permissions = await getUserGroupRoutePermissions(wsId, request);
    if (!permissions?.containsPermission('send_user_group_report_emails')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();
    const privateDb = sbAdmin.schema('private');
    const reportResult = await privateDb
      .from('external_user_monthly_reports_workspace_view')
      .select(
        'id, title, content, feedback, user_id, user_email, user_ws_id, report_approval_status, delivery_status'
      )
      .eq('id', reportId)
      .eq('user_ws_id', wsId)
      .maybeSingle();
    if (reportResult.error) throw reportResult.error;
    const report = reportResult.data;
    if (!report) {
      return NextResponse.json(
        { message: 'Report not found' },
        { status: 404 }
      );
    }

    if (parsed.data.action === 'preview') {
      return NextResponse.json({
        message: 'Preview ready. No email was queued.',
        preview: {
          content: report.content,
          feedback: report.feedback,
          recipient: report.user_email,
          title: report.title,
        },
        queued: false,
        status: report.delivery_status,
      });
    }

    if (
      report.delivery_status === 'processing' ||
      (report.delivery_status === 'queued' &&
        parsed.data.action !== 'cancel') ||
      report.delivery_status === 'sent'
    ) {
      return NextResponse.json(
        { message: 'This report is already queued, processing, or sent.' },
        { status: 409 }
      );
    }
    if (parsed.data.action === 'cancel') {
      const cancelResult = await privateDb
        .from('user_report_email_queue')
        .update({
          locked_at: null,
          locked_by: null,
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('report_id', reportId)
        .in('status', ['queued', 'failed'])
        .select('id');
      if (cancelResult.error) throw cancelResult.error;
      if (!cancelResult.data?.length)
        return NextResponse.json(
          { message: 'No waiting delivery to cancel.' },
          { status: 409 }
        );
      return NextResponse.json({
        message: 'Delivery cancelled.',
        queued: false,
        status: 'cancelled',
      });
    }

    if (report.report_approval_status !== 'APPROVED') {
      return NextResponse.json(
        { message: 'Approve this report before sending it.' },
        { status: 409 }
      );
    }
    if (!report.user_email?.trim() || !report.user_id) {
      await privateDb
        .from('external_user_monthly_reports')
        .update({
          delivery_status: 'blocked',
          last_delivery_error:
            'The report subject or workspace profile email is missing.',
        })
        .eq('id', reportId);
      return NextResponse.json(
        {
          message: 'The report subject or workspace profile email is missing.',
        },
        { status: 409 }
      );
    }

    const [globalGateEnabled, periodicGateEnabled] = await Promise.all([
      verifySecret({
        forceAdmin: true,
        name: 'ENABLE_EMAIL_SENDING',
        value: 'true',
        wsId,
      }),
      verifySecret({
        forceAdmin: true,
        name: 'ENABLE_REPORT_EMAIL_SENDING',
        value: 'true',
        wsId,
      }),
    ]);
    if (!globalGateEnabled || !periodicGateEnabled) {
      await privateDb
        .from('external_user_monthly_reports')
        .update({
          delivery_status: 'blocked',
          last_delivery_error:
            'Periodic report email delivery is disabled for this workspace.',
        })
        .eq('id', reportId);
      return NextResponse.json(
        {
          message:
            'Both workspace email gates must be enabled before periodic reports can send.',
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const queuePayload = {
      delivery_kind: parsed.data.action === 'test' ? 'test' : 'send',
      last_error: null,
      sent_at: null,
      provider_message_id: null,
      locked_at: null,
      locked_by: null,
      next_attempt_at: now,
      recipient_email: report.user_email.trim(),
      report_id: reportId,
      status: 'queued',
      updated_at: now,
      user_id: report.user_id,
      ws_id: wsId,
      ...(parsed.data.action === 'retry' ? { attempt_count: 0 } : {}),
    };
    // Insert only if absent; never overwrite a worker's active or sent row.
    let queueResult = await privateDb
      .from('user_report_email_queue')
      .upsert(queuePayload, { onConflict: 'report_id', ignoreDuplicates: true })
      .select('id')
      .maybeSingle();
    if (queueResult.error) throw queueResult.error;
    if (!queueResult.data) {
      queueResult = await privateDb
        .from('user_report_email_queue')
        .update({ ...queuePayload, attempt_count: 0 })
        .eq('report_id', reportId)
        .eq('ws_id', wsId)
        .or(
          'and(status.in.(failed,blocked,cancelled),or(sent_at.is.null,delivery_kind.eq.test)),and(status.eq.sent,delivery_kind.eq.test)'
        )
        .select('id')
        .maybeSingle();
      if (queueResult.error) throw queueResult.error;
    }
    if (!queueResult.data) {
      return NextResponse.json(
        { message: 'Delivery is already active or sent.' },
        { status: 409 }
      );
    }
    // The queue trigger synchronizes report state atomically with this write.
    return NextResponse.json({
      message:
        parsed.data.action === 'test'
          ? 'Test delivery queued for the subject profile email.'
          : 'Periodic report delivery queued.',
      queued: true,
      status: 'queued',
    });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === '23514'
    ) {
      return NextResponse.json(
        {
          message:
            'Delivery state changed. Refresh the report before trying again.',
        },
        { status: 409 }
      );
    }
    console.error('Error in periodic report delivery POST:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
