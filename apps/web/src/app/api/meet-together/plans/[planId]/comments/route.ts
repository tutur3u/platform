import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET(
  _: Request,
  { params }: { params: { planId: string } }
) {
  const { planId } = params;
  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin
    .from('plan_comments')
    .select('id, user_id, guest_id, author_name, content, created_at')
    .eq('plan_id', planId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json(
      { message: 'Failed to fetch comments', error },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(
  req: Request,
  { params }: { params: { planId: string } }
) {
  const { planId } = params;
  const { content, author_name, userType, guestId } = await req.json();
  if (!content?.trim() || !author_name?.trim()) {
    return NextResponse.json(
      { message: 'Missing content or author name' },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();
  let userId: string | null = null;

  if (userType === 'PLATFORM') {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
  }

  const { error, data } = await sbAdmin
    .from('plan_comments')
    .insert({
      plan_id: planId,
      user_id: userType === 'PLATFORM' ? userId : null,
      guest_id: userType === 'GUEST' ? guestId : null,
      author_name,
      content,
    })
    .select('id, author_name, content, created_at')
    .single();

  if (error) {
    return NextResponse.json(
      { message: 'Failed to add comment', error },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
