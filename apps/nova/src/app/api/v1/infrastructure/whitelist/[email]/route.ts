import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

export async function PUT(req: NextRequest) {
  const { email, enabled, allow_challenge_management, allow_role_management } =
    (await req.json()) as {
      email: string;
      enabled: boolean;
      allow_challenge_management: boolean;
      allow_role_management: boolean;
    };

  if (!email) {
    return NextResponse.json({ message: 'Email is required' }, { status: 400 });
  }

  const supabase = await createClient();

  const updateData = {
    email,
    enabled: enabled ?? false,
    allow_challenge_management: allow_challenge_management ?? false,
    allow_role_management: allow_role_management ?? false,
  };

  const { error } = await supabase
    .from('nova_roles')
    .update(updateData)
    .eq('email', email);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching AI Models' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ email: string }> }
) {
  const { email } = await params;

  if (!email) {
    return NextResponse.json({ message: 'Email is required' }, { status: 400 });
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('nova_roles')
    .delete()
    .eq('email', email);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching AI Models' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
