import { MAX_SEARCH_LENGTH } from '@tuturuuu/utils/constants';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';

const UpdateEmailBlacklistSchema = z.object({
  reason: z.string().max(MAX_SEARCH_LENGTH).optional(),
});

interface Params {
  params: Promise<{
    entryId: string;
  }>;
}

export async function GET(_request: Request, { params }: Params) {
  await connection();

  const authorization = await authorizeInfrastructureAdminRequest();
  if (!authorization.ok) return authorization.response;
  const supabase = authorization.sbAdmin;
  const { entryId } = await params;

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
  const authorization = await authorizeInfrastructureAdminRequest();
  if (!authorization.ok) return authorization.response;
  const supabase = authorization.sbAdmin;
  const { entryId } = await params;

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

export async function DELETE(_request: Request, { params }: Params) {
  const authorization = await authorizeInfrastructureAdminRequest();
  if (!authorization.ok) return authorization.response;
  const supabase = authorization.sbAdmin;
  const { entryId } = await params;

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
