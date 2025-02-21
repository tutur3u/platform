import { createClient } from '@tutur3u/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const supabase = await createClient();

  const requestUrl = new URL(req.url);
  const query = requestUrl.searchParams.get('query');

  if (!query)
    return NextResponse.json(
      { message: 'Missing search query' },
      { status: 400 }
    );

  const { data, error } = await supabase.rpc('search_users_by_name', {
    search_query: query,
  });

  if (error)
    return NextResponse.json(
      { message: 'Error searching users' },
      { status: 500 }
    );

  return NextResponse.json({ users: data });
}
