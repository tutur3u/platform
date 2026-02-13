import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    transactionId: string;
    wsId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { transactionId, wsId } = await params;
  const permissions = await getPermissions({
    wsId,
  });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { withoutPermission } = permissions;

  if (withoutPermission('view_transactions')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from('wallet_transaction_tags')
    .select('tag_id')
    .eq('transaction_id', transactionId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching transaction tags' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
