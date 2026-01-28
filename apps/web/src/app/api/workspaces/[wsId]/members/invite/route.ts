import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { canCreateInvitation } from '@/utils/seat-limits';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

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
    // Fire and forget - don't wait for response
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
  const supabase = await createClient();
  const { wsId } = await params;

  const { email } = await req.json();

  if (!email) {
    return NextResponse.json(
      { message: 'Email is required.' },
      { status: 400 }
    );
  }

  // Check if seat limit allows creating invitations
  const inviteCheck = await canCreateInvitation(supabase, wsId);
  if (!inviteCheck.allowed) {
    return NextResponse.json(
      {
        error: 'seat_limit_reached',
        message: inviteCheck.message,
        seatStatus: inviteCheck.status,
      },
      { status: 403 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from('workspace_email_invites').insert({
    ws_id: wsId,
    email: email.toLowerCase(),
    invited_by: user?.id,
  });

  if (error) {
    console.log(error);
    return NextResponse.json(
      {
        message: error.message.includes('duplicate key value')
          ? 'User is already a member of this workspace or has a pending invite.'
          : 'Error inviting workspace member.',
      },
      { status: 500 }
    );
  }

  // Trigger immediate notification processing
  // The database trigger will create the notification batch with delivery_mode='immediate'
  // This call ensures it gets processed right away
  triggerImmediateNotification();

  return NextResponse.json({ message: 'success' });
}
