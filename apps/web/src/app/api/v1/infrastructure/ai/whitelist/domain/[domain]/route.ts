import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ domain: string }> }
) {
  try {
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

    const { domain } = await params;
    const { enabled } = await request.json();

    const { error } = await sbAdmin
      .from('ai_whitelisted_domains')
      .update({ enabled })
      .eq('domain', domain);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating domain:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ domain: string }> }
) {
  try {
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

    const { domain } = await params;

    const { error } = await sbAdmin
      .from('ai_whitelisted_domains')
      .delete()
      .eq('domain', domain);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting domain:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
