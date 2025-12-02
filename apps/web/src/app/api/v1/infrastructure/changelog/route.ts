import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkChangelogPermission } from './utils';

const CreateChangelogSchema = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  content: z.object({
    type: z.literal('doc'),
    content: z.array(z.any()).optional(),
  }),
  summary: z.string().max(500).optional(),
  category: z.enum([
    'feature',
    'improvement',
    'bugfix',
    'breaking',
    'security',
    'performance',
  ]),
  version: z.string().max(50).optional(),
  cover_image_url: z.string().url().optional().nullable(),
});

export async function GET(req: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);

  const published = searchParams.get('published');
  const category = searchParams.get('category');
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
  const offset = (page - 1) * pageSize;

  // Check if user has manage_changelog permission (for admin access to drafts)
  const { authorized } = await checkChangelogPermission(supabase);

  let query = supabase
    .from('changelog_entries')
    .select('*', { count: 'exact' });

  // If not an admin, only show published entries
  if (!authorized) {
    query = query.eq('is_published', true).not('published_at', 'is', null);
  } else if (published === 'true') {
    query = query.eq('is_published', true);
  } else if (published === 'false') {
    query = query.eq('is_published', false);
  }

  if (category) {
    query = query.eq('category', category);
  }

  query = query
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching changelog entries:', error);
    return NextResponse.json(
      { message: 'Error fetching changelog entries' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data,
    pagination: {
      page,
      pageSize,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / pageSize),
    },
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();

  const { authorized, user } = await checkChangelogPermission(supabase);
  if (!authorized) {
    return NextResponse.json(
      { message: user ? 'Forbidden' : 'Unauthorized' },
      { status: user ? 403 : 401 }
    );
  }

  try {
    const body = await req.json();
    const validatedData = CreateChangelogSchema.parse(body);

    // Normalize slug to lowercase and replace spaces with hyphens
    const normalizedSlug = validatedData.slug
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    const { data, error } = await supabase
      .from('changelog_entries')
      .insert({
        ...validatedData,
        slug: normalizedSlug,
        creator_id: user!.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating changelog entry:', error);

      if (error.code === '23505') {
        return NextResponse.json(
          { message: 'A changelog entry with this slug already exists' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { message: 'Error creating changelog entry' },
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
