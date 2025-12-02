import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkChangelogPermission } from '../../utils';

const PublishChangelogSchema = z.object({
  is_published: z.boolean(),
});

interface Params {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { id } = await params;

  const { authorized, user } = await checkChangelogPermission(supabase);
  if (!authorized) {
    return NextResponse.json(
      { message: user ? 'Forbidden' : 'Unauthorized' },
      { status: user ? 403 : 401 }
    );
  }

  try {
    const body = await req.json();
    const { is_published } = PublishChangelogSchema.parse(body);

    // Check if entry exists
    const { data: existingEntry, error: fetchError } = await supabase
      .from('changelog_entries')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingEntry) {
      return NextResponse.json(
        { message: 'Changelog entry not found' },
        { status: 404 }
      );
    }

    // Update publish status
    const updateData: {
      is_published: boolean;
      published_at: string | null;
    } = {
      is_published,
      published_at: is_published ? new Date().toISOString() : null,
    };

    // If already published and we're publishing again, keep the original published_at
    if (is_published && existingEntry.published_at) {
      updateData.published_at = existingEntry.published_at;
    }

    const { data, error } = await supabase
      .from('changelog_entries')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating changelog publish status:', error);
      return NextResponse.json(
        { message: 'Error updating changelog publish status' },
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
