import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const supabase = await createClient(request);
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sbAdmin = await createAdminClient();
    const { data: templates, error } = await sbAdmin
      .from('task_board_status_templates')
      .select('*')
      .order('is_default', { ascending: false })
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch status templates' },
        { status: 500 }
      );
    }

    return NextResponse.json({ templates: templates ?? [] });
  } catch (error) {
    console.error('Error fetching task board status templates:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
