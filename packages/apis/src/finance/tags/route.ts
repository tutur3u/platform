import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export async function GET(
  _: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const supabase = await createClient();
  const { wsId } = await params;
  const { withoutPermission } = await getPermissions({
    wsId,
  });

  // TODO: Migrate to another permission
  if (withoutPermission('manage_finance')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from('transaction_tags')
    .select('*')
    .eq('ws_id', wsId)
    .order('name');

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching tags' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
