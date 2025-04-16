import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    submissionId: string;
  }>;
}

/**
 * GET /api/v1/admin/submissions/[submissionId]
 * Admin endpoint to fetch a single submission with all related data
 */
export async function GET(_request: Request, { params }: Params) {
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
  const { submissionId } = await params;

  try {
    const { data: submission, error } = await sbAdmin
      .from('nova_submissions')
      .select(
        `
        *,
        nova_problems (
          id,
          title,
          challenge_id,
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
      `
      )
      .eq('id', submissionId)
      .single();

    if (error) {
      console.error('Database Error: ', error);
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { message: 'Submission not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { message: 'Error fetching submission' },
        { status: 500 }
      );
    }

    return NextResponse.json(submission, { status: 200 });
  } catch (error) {
    console.error('Unexpected Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
