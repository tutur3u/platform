import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

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
