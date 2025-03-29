import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

/**
 * GET /api/v1/admin/submissions
 * Admin endpoint to fetch submissions with pagination, sorting and search
 */
export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id || !user?.email) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { error: roleError } = await supabase
    .from('nova_roles')
    .select('*')
    .eq('email', user.email)
    .eq('allow_challenge_management', true)
    .single();

  if (roleError) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient();

  const { searchParams } = new URL(request.url);

  // Parse query parameters
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '10');
  const sortField = searchParams.get('sortField') || 'created_at';
  const sortDirection = (searchParams.get('sortDirection') || 'desc') as
    | 'asc'
    | 'desc';
  const search = searchParams.get('search') || '';

  // Calculate pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    // Initialize query
    let query = sbAdmin.from('nova_submissions').select(
      `
        *,
        nova_problems (
          id,
          title,
          nova_challenges (
            id,
            title
          )
        ),
        users (
          id,
          display_name,
          avatar_url
        )
      `,
      { count: 'exact' }
    );

    // Apply search if provided
    if (search) {
      query = query.or(
        `prompt.ilike.%${search}%,feedback.ilike.%${search}%,users.display_name.ilike.%${search}%,nova_problems.title.ilike.%${search}%`
      );
    }

    // Apply sorting and pagination
    const validSortFields = [
      'id',
      'created_at',
      'score',
      'user_id',
      'problem_id',
    ];
    const actualSortField = validSortFields.includes(sortField)
      ? sortField
      : 'created_at';

    const {
      data: submissions,
      count,
      error,
    } = await query
      .order(actualSortField, { ascending: sortDirection === 'asc' })
      .range(from, to);

    if (error) {
      console.error('Database Error: ', error);
      return NextResponse.json(
        { message: 'Error fetching submissions' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        submissions,
        count,
        page,
        pageSize,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
