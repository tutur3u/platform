import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkChangelogPermission } from '../utils';

const UpdateChangelogSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(255).optional(),
  content: z
    .object({
      type: z.literal('doc'),
      content: z.array(z.any()).optional(),
    })
    .optional(),
  summary: z.string().max(500).optional().nullable(),
  category: z
    .enum([
      'feature',
      'improvement',
      'bugfix',
      'breaking',
      'security',
      'performance',
    ])
    .optional(),
  version: z.string().max(50).optional().nullable(),
  cover_image_url: z.string().url().optional().nullable(),
});

interface Params {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { id } = await params;

  const { authorized } = await checkChangelogPermission(supabase);

  let query = supabase.from('changelog_entries').select('*').eq('id', id);

  // If not admin, only allow viewing published entries
  if (!authorized) {
    query = query.eq('is_published', true).not('published_at', 'is', null);
  }

  const { data, error } = await query.single();

  if (error) {
    console.error('Error fetching changelog entry:', error);
    return NextResponse.json(
      { message: 'Changelog entry not found' },
      { status: error.code === 'PGRST116' ? 404 : 500 }
    );
  }

  return NextResponse.json(data);
}

export async function PUT(req: Request, { params }: Params) {
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
    const validatedData = UpdateChangelogSchema.parse(body);

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

    // Normalize slug if provided
    const updateData = { ...validatedData };
    if (updateData.slug) {
      updateData.slug = updateData.slug
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
    }

    const { data, error } = await supabase
      .from('changelog_entries')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating changelog entry:', error);

      if (error.code === '23505') {
        return NextResponse.json(
          { message: 'A changelog entry with this slug already exists' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { message: 'Error updating changelog entry' },
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
  const { id } = await params;

  const { authorized, user } = await checkChangelogPermission(supabase);
  if (!authorized) {
    return NextResponse.json(
      { message: user ? 'Forbidden' : 'Unauthorized' },
      { status: user ? 403 : 401 }
    );
  }

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

  const { error } = await supabase
    .from('changelog_entries')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting changelog entry:', error);
    return NextResponse.json(
      { message: 'Error deleting changelog entry' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'Changelog entry deleted successfully' });
}
