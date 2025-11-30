import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    slug: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { slug } = await params;

  // This endpoint is public - only returns published changelogs
  const { data, error } = await supabase
    .from('changelog_entries')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .not('published_at', 'is', null)
    .single();

  if (error) {
    console.error('Error fetching changelog entry:', error);
    return NextResponse.json(
      { message: 'Changelog entry not found' },
      { status: error.code === 'PGRST116' ? 404 : 500 }
    );
  }

  return NextResponse.json(data);
}
