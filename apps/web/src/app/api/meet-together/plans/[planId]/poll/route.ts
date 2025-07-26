// apps/web/src/app/api/meet-together/plans/[planId]/poll/route.ts
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

// POST: create a new poll for the plan
export async function POST(
  req: Request,
  { params }: { params: { planId: string } }
) {
  const { planId } = params;
  const { name, allow_anonymous_updates = false } = await req.json();

  // Auth: Only logged-in users can create polls
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Insert poll
  const sbAdmin = await createAdminClient();
  const { data: poll, error } = await sbAdmin
    .from('polls')
    .insert({
      name,
      plan_id: planId,
      creator_id: user.id,
      allow_anonymous_updates,
    })
    .select(
      'id, name, plan_id, creator_id, allow_anonymous_updates, created_at'
    )
    .single();

  if (error) {
    return NextResponse.json(
      { message: 'Failed to create poll', error },
      { status: 500 }
    );
  }

  return NextResponse.json({ poll, message: 'Poll created' });
}
