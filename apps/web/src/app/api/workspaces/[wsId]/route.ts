import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId: id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { message: 'Error fetching user' },
      { status: 500 }
    );
  }

  const { data, error } = await supabase
    .from('workspaces')
    .select('id, name, created_at, workspace_members!inner(user_id)')
    .eq('id', id)
    .eq('workspace_members.user_id', user.id)
    .single();

  if (error || !data?.workspace_members[0]?.user_id)
    return NextResponse.json(
      { message: 'Error fetching workspaces' },
      { status: 500 }
    );

  return NextResponse.json(data);
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId: id } = await params;

  const { name } = await req.json();

  const { error } = await supabase
    .from('workspaces')
    .update({
      name,
    })
    .eq('id', id);

  if (error)
    return NextResponse.json(
      { message: 'Error updating workspace' },
      { status: 500 }
    );

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId: id } = await params;

  // Check for active subscription to cancel immediately
  try {
    const { data: subscription, error: subError } = await supabase
      .from('workspace_subscriptions')
      .select('polar_subscription_id')
      .eq('ws_id', id)
      .neq('status', 'canceled')
      .maybeSingle();

    if (subError) throw subError;

    if (subscription?.polar_subscription_id) {
      const polar = createPolarClient();
      await polar.subscriptions.revoke({
        id: subscription.polar_subscription_id,
      });
      console.log(
        `Revoked Polar subscription ${subscription.polar_subscription_id} for workspace ${id}`
      );
    }
  } catch (error) {
    console.error('Failed to revoke Polar subscription:', error);
    // Continue with workspace deletion even if subscription cancellation fails
  }

  const { error } = await supabase.from('workspaces').delete().eq('id', id);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
