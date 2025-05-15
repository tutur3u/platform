import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

export async function PUT(req: NextRequest) {
  const {
    userId,
    enabled,
    allow_challenge_management,
    allow_manage_all_challenges,
    allow_role_management,
  } = (await req.json()) as {
    userId: string;
    enabled: boolean;
    allow_challenge_management: boolean;
    allow_manage_all_challenges: boolean;
    allow_role_management: boolean;
  };

  if (!userId) {
    return NextResponse.json(
      { message: 'User Id is required' },
      { status: 400 }
    );
  }

  const supabase = await createAdminClient();

  const updateData = {
    enabled: enabled ?? false,
    allow_challenge_management: allow_challenge_management ?? false,
    allow_manage_all_challenges: allow_manage_all_challenges ?? false,
    allow_role_management: allow_role_management ?? false,
  };

  const { error } = await supabase
    .from('platform_user_roles')
    .update(updateData)
    .eq('user_id', userId);

  if (error) {
    console.error('Error updating user roles:', error);
    return NextResponse.json(
      { message: 'Error updating user permissions', error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  if (!userId) {
    return NextResponse.json(
      { message: 'User Id is required' },
      { status: 400 }
    );
  }

  const supabase = await createAdminClient();

  const { error } = await supabase
    .from('platform_user_roles')
    .delete()
    .eq('user_id', userId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching AI Models' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
