import { MAX_NAME_LENGTH, MAX_SEARCH_LENGTH } from '@tuturuuu/utils/constants';
import {
  DOMAIN_BLACKLIST_REGEX,
  EMAIL_BLACKLIST_REGEX,
} from '@tuturuuu/utils/email/validation';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';

const CreateEmailBlacklistSchema = z.object({
  entry_type: z.enum(['email', 'domain']),
  value: z.string().min(1).max(MAX_NAME_LENGTH),
  reason: z.string().max(MAX_SEARCH_LENGTH).optional(),
});

export async function GET() {
  await connection();

  const authorization = await authorizeInfrastructureAdminRequest();
  if (!authorization.ok) return authorization.response;
  const { sbAdmin: supabase } = authorization;

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
  const authorization = await authorizeInfrastructureAdminRequest();
  if (!authorization.ok) return authorization.response;
  const { sbAdmin: supabase, user } = authorization;

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
