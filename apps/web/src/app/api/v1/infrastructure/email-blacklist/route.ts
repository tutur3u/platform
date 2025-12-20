import { createClient } from '@tuturuuu/supabase/next/server';
import {
  DOMAIN_BLACKLIST_REGEX,
  EMAIL_BLACKLIST_REGEX,
} from '@tuturuuu/utils/email/validation';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const CreateEmailBlacklistSchema = z.object({
  entry_type: z.enum(['email', 'domain']),
  value: z.string().min(1).max(255),
  reason: z.string().max(500).optional(),
});

export async function GET(req: Request) {
  const supabase = await createClient();

  // Check if user is authenticated and from root workspace
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Check if user is from root workspace
  const { data: rootWorkspaceUser } = await supabase
    .from('workspace_user_linked_users')
    .select('*')
    .eq('platform_user_id', user.id)
    .eq('ws_id', '00000000-0000-0000-0000-000000000000')
    .single();

  if (!rootWorkspaceUser) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('email_blacklist')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching email blacklist:', error);
    return NextResponse.json(
      { message: 'Error fetching email blacklist entries' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = await createClient();

  // Check if user is authenticated and from root workspace
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // Check if user is from root workspace
  const { data: rootWorkspaceUser } = await supabase
    .from('workspace_user_linked_users')
    .select('*')
    .eq('platform_user_id', user.id)
    .eq('ws_id', '00000000-0000-0000-0000-000000000000')
    .single();

  if (!rootWorkspaceUser) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const validatedData = CreateEmailBlacklistSchema.parse(body);

    // Additional validation based on entry type, sharing patterns with UI & database constraints
    if (validatedData.entry_type === 'email') {
      if (!EMAIL_BLACKLIST_REGEX.test(validatedData.value)) {
        return NextResponse.json(
          { message: 'Invalid email address format' },
          { status: 400 }
        );
      }
    } else if (validatedData.entry_type === 'domain') {
      if (!DOMAIN_BLACKLIST_REGEX.test(validatedData.value)) {
        return NextResponse.json(
          { message: 'Invalid domain format' },
          { status: 400 }
        );
      }
    }

    const { data, error } = await supabase
      .from('email_blacklist')
      .insert({
        ...validatedData,
        added_by_user_id: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating email blacklist entry:', error);

      // Check for unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json(
          { message: 'This entry already exists in the blacklist' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { message: 'Error creating email blacklist entry' },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
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
