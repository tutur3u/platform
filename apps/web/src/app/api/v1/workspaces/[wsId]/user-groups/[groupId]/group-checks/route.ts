import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    groupId: string;
    wsId: string;
  }>;
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = await req.json();
  const { wsId } = await params;

  // Check permissions
  const { withoutPermission } = await getPermissions({ wsId });
  if (withoutPermission('update_user_groups_posts')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update user group posts' },
      { status: 403 }
    );
  }

  const { error } = await supabase.from('user_group_post_checks').insert(data);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error inserting data into user_group_post_checks' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'Data inserted successfully' });
}
