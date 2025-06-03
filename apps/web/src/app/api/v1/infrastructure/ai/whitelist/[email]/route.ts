import {
  createAdminClient,
  createClient,
} from '@ncthub/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

export async function PUT(req: NextRequest) {
  const { email, enabled } = await req.json();

  if (!email) {
    return NextResponse.json({ message: 'Email is required' }, { status: 400 });
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email?.endsWith('@tuturuuu.com'))
    return NextResponse.json(
      { message: 'You are not allowed to perform this action' },
      { status: 403 }
    );

  const sbAdmin = await createAdminClient();

  const { error } = await sbAdmin
    .from('ai_whitelisted_emails')
    .update({ email, enabled })
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email?.endsWith('@tuturuuu.com'))
    return NextResponse.json(
      { message: 'You are not allowed to perform this action' },
      { status: 403 }
    );

  const sbAdmin = await createAdminClient();

  const { error } = await sbAdmin
    .from('ai_whitelisted_emails')
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
