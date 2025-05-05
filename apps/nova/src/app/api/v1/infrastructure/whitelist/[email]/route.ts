import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

export async function PUT(req: NextRequest) {
  const { email, enabled } = (await req.json()) as {
    email: string;
    enabled: boolean;
  };

  if (!email) {
    return NextResponse.json({ message: 'Email is required' }, { status: 400 });
  }

  const supabase = await createAdminClient();

  const updateData = {
    email,
    enabled: enabled ?? false,
  };

  const { error } = await supabase
    .from('platform_email_roles')
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
    .from('platform_email_roles')
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
