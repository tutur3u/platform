import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const UpdateEmailBlacklistSchema = z.object({
  reason: z.string().max(500).optional(),
});

interface Params {
  params: Promise<{
    entryId: string;
  }>;
}

async function checkRootWorkspaceAccess(supabase: any) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { authorized: false, user: null };
  }

  // Check if user is from root workspace
  const { data: rootWorkspaceUser } = await supabase
    .from('workspace_user_linked_users')
    .select('*')
    .eq('platform_user_id', user.id)
    .eq('ws_id', '00000000-0000-0000-0000-000000000000')
    .single();

  if (!rootWorkspaceUser) {
    return { authorized: false, user };
  }

  return { authorized: true, user };
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { entryId } = await params;

  const { authorized } = await checkRootWorkspaceAccess(supabase);
  if (!authorized) {
    return NextResponse.json(
      { message: 'Unauthorized' },
      { status: authorized === false ? 401 : 403 }
    );
  }

  const { data, error } = await supabase
    .from('email_blacklist')
    .select('*')
    .eq('id', entryId)
    .single();

  if (error) {
    console.error('Error fetching email blacklist entry:', error);
    return NextResponse.json(
      { message: 'Error fetching email blacklist entry' },
      { status: error.code === 'PGRST116' ? 404 : 500 }
    );
  }

  return NextResponse.json(data);
}

export async function PUT(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { entryId } = await params;

  const { authorized, user } = await checkRootWorkspaceAccess(supabase);
  if (!authorized) {
    return NextResponse.json(
      { message: 'Unauthorized' },
      { status: user ? 403 : 401 }
    );
  }

  try {
    const body = await req.json();
    const validatedData = UpdateEmailBlacklistSchema.parse(body);

    // Check if entry exists
    const { data: existingEntry, error: fetchError } = await supabase
      .from('email_blacklist')
      .select('*')
      .eq('id', entryId)
      .single();

    if (fetchError || !existingEntry) {
      return NextResponse.json(
        { message: 'Email blacklist entry not found' },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from('email_blacklist')
      .update(validatedData)
      .eq('id', entryId)
      .select()
      .single();

    if (error) {
      console.error('Error updating email blacklist entry:', error);
      return NextResponse.json(
        { message: 'Error updating email blacklist entry' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid request data', errors: error.issues },
        { status: 400 }
      );
    }

    console.error('Unexpected error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { entryId } = await params;

  const { authorized, user } = await checkRootWorkspaceAccess(supabase);
  if (!authorized) {
    return NextResponse.json(
      { message: 'Unauthorized' },
      { status: user ? 403 : 401 }
    );
  }

  // Check if entry exists
  const { data: existingEntry, error: fetchError } = await supabase
    .from('email_blacklist')
    .select('*')
    .eq('id', entryId)
    .single();

  if (fetchError || !existingEntry) {
    return NextResponse.json(
      { message: 'Email blacklist entry not found' },
      { status: 404 }
    );
  }

  const { error } = await supabase
    .from('email_blacklist')
    .delete()
    .eq('id', entryId);

  if (error) {
    console.error('Error deleting email blacklist entry:', error);
    return NextResponse.json(
      { message: 'Error deleting email blacklist entry' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'Entry deleted successfully' });
}
