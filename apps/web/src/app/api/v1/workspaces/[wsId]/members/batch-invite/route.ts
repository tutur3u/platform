import { getEffectiveAvailableSeats } from '@tuturuuu/payment-core/seat-limits';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MAX_COLOR_LENGTH, MAX_EMAIL_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveWorkspaceRouteAccess } from '@/lib/workspace-route-access';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const BatchInviteSchema = z.object({
  emails: z
    .array(z.string().email().max(MAX_EMAIL_LENGTH))
    .min(1)
    .max(MAX_COLOR_LENGTH),
});

// Helper to trigger immediate notification processing
async function triggerImmediateNotification() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tuturuuu.com';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.warn(
      'CRON_SECRET not configured, skipping immediate notification trigger'
    );
    return;
  }

  try {
    fetch(`${baseUrl}/api/notifications/send-immediate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({}),
    }).catch((err) => {
      console.error('Failed to trigger immediate notification:', err);
    });
  } catch (error) {
    console.error('Error triggering immediate notification:', error);
  }
}

export async function POST(req: Request, { params }: Params) {
  const { wsId: requestedWsId } = await params;

  // Satellite apps proxy this route to web with an app-session token rather
  // than a Supabase auth cookie, so resolve the actor, the `personal` alias and
  // the membership through the app-session-aware helper (same as the single
  // invite route) instead of reading Supabase auth directly.
  const access = await resolveWorkspaceRouteAccess(req, requestedWsId);
  if (!access.ok) return access.response;

  const { permissions, supabase, user } = access;

  if (
    permissions.membershipType !== 'MEMBER' ||
    permissions.withoutPermission('manage_workspace_members')
  ) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const wsId = permissions.wsId;
  const sbAdmin = await createAdminClient();

  // Block invitations to personal workspaces
  const { data: wsData, error: workspaceError } = await sbAdmin
    .from('workspaces')
    .select('personal')
    .eq('id', wsId)
    .maybeSingle();
  if (workspaceError) {
    console.error('Failed to verify workspace before batch inviting members', {
      error: workspaceError,
      wsId,
    });
    return NextResponse.json(
      { message: 'Error inviting workspace member.' },
      { status: 500 }
    );
  }
  if (wsData?.personal) {
    return NextResponse.json(
      { message: 'Cannot invite members to a personal workspace.' },
      { status: 403 }
    );
  }

  const { data: disableInvite, error: settingsError } = await sbAdmin
    .from('workspace_secrets')
    .select('value')
    .eq('ws_id', wsId)
    .eq('name', 'DISABLE_INVITE')
    .maybeSingle();
  if (settingsError) {
    console.error('Failed to verify workspace invite settings', {
      error: settingsError,
      wsId,
    });
    return NextResponse.json(
      { message: 'Unable to verify invite settings' },
      { status: 500 }
    );
  }
  if (disableInvite) {
    return NextResponse.json(
      { message: 'Invitations are disabled' },
      { status: 403 }
    );
  }

  // Parse and validate request body
  let body: z.infer<typeof BatchInviteSchema>;
  try {
    const rawBody = await req.json();
    body = BatchInviteSchema.parse(rawBody);
  } catch {
    return NextResponse.json(
      { message: 'Invalid request body. Expected { emails: string[] }' },
      { status: 400 }
    );
  }

  // Normalize emails to lowercase and remove duplicates
  const uniqueEmails = [...new Set(body.emails.map((e) => e.toLowerCase()))];

  // Pre-flight seat check: reject entire batch if insufficient seats
  const { status: seatStatus, effectiveAvailable } =
    await getEffectiveAvailableSeats(sbAdmin, wsId);

  if (seatStatus.isSeatBased && effectiveAvailable < uniqueEmails.length) {
    return NextResponse.json(
      {
        message: `Not enough seats to invite ${uniqueEmails.length} user(s). Available: ${effectiveAvailable}, Total seats: ${seatStatus.seatCount}.`,
        code: 'SEAT_LIMIT_REACHED',
        availableSeats: effectiveAvailable,
        requestedCount: uniqueEmails.length,
      },
      { status: 403 }
    );
  }

  // Insert all invites (ignore duplicates)
  const invites = uniqueEmails.map((email) => ({
    ws_id: wsId,
    email,
    invited_by: user.id,
  }));

  const results: { email: string; success: boolean; error?: string }[] = [];

  // Insert one by one to handle individual failures gracefully
  for (const invite of invites) {
    const { error } = await sbAdmin
      .from('workspace_email_invites')
      .insert(invite);

    if (error) {
      console.error('Failed to create workspace email invitation', {
        code: error.code,
        workspaceId: wsId,
      });
      const isDuplicate = error.message.includes('duplicate key value');
      const isSeatLimit =
        error.message.includes('workspace_has_available_seats') ||
        error.message.includes('seat');
      results.push({
        email: invite.email,
        success: false,
        error: isDuplicate
          ? 'Already invited or member'
          : isSeatLimit
            ? 'Seat limit reached'
            : 'Failed to send invite',
      });
    } else {
      results.push({ email: invite.email, success: true });
    }
  }

  const successCount = results.filter((r) => r.success).length;

  // Update onboarding progress with invited emails
  if (successCount > 0) {
    const successfulEmails = results
      .filter((r) => r.success)
      .map((r) => r.email);

    // Get existing invited emails and merge
    const { data: existingProgress } = await supabase
      .from('onboarding_progress')
      .select('invited_emails')
      .eq('user_id', user.id)
      .maybeSingle();

    const existingEmails = existingProgress?.invited_emails || [];
    const allInvitedEmails = [
      ...new Set([...existingEmails, ...successfulEmails]),
    ];

    await supabase.from('onboarding_progress').upsert(
      {
        user_id: user.id,
        invited_emails: allInvitedEmails,
      },
      { onConflict: 'user_id' }
    );

    // Trigger immediate notification processing
    triggerImmediateNotification();
  }

  return NextResponse.json({
    message: `${successCount} invite(s) sent successfully`,
    successCount,
    totalRequested: uniqueEmails.length,
    results,
  });
}
