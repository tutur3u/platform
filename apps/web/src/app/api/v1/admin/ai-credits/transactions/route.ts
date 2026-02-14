import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error: memberError } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', ROOT_WORKSPACE_ID)
      .eq('user_id', user.id)
      .single();

    if (memberError) {
      return NextResponse.json(
        { error: 'Root workspace admin required' },
        { status: 403 }
      );
    }

    const params = req.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get('page') ?? 1));
    const limit = Math.min(100, Math.max(1, Number(params.get('limit') ?? 50)));

    const rpcParams: Record<string, unknown> = {
      p_page: page,
      p_limit: limit,
    };

    const wsId = params.get('ws_id');
    const userId = params.get('user_id');
    const scope = params.get('scope');
    const transactionType = params.get('transaction_type');
    const feature = params.get('feature');
    const modelId = params.get('model_id');
    const startDate = params.get('start_date');
    const endDate = params.get('end_date');

    if (wsId) rpcParams.p_ws_id = wsId;
    if (userId) rpcParams.p_user_id = userId;
    if (scope) rpcParams.p_scope = scope;
    if (transactionType) rpcParams.p_transaction_type = transactionType;
    if (feature) rpcParams.p_feature = feature;
    if (modelId) rpcParams.p_model_id = modelId;
    if (startDate) rpcParams.p_start_date = startDate;
    if (endDate) rpcParams.p_end_date = endDate;

    const sbAdmin = await createAdminClient();
    const { data, error } = await sbAdmin.rpc(
      'admin_list_ai_credit_transactions',
      rpcParams
    );

    if (error) {
      console.error('Error listing transactions:', error);
      return NextResponse.json(
        { error: 'Failed to list transactions' },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as (Record<string, unknown> & {
      total_count: unknown;
    })[];
    const totalCount = rows.length > 0 ? Number(rows[0]?.total_count ?? 0) : 0;

    return NextResponse.json({
      data: rows.map(
        ({
          total_count: _,
          ...row
        }: Record<string, unknown> & { total_count: unknown }) => row
      ),
      pagination: { page, limit, total: totalCount },
    });
  } catch (error) {
    console.error('Error in admin transactions route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
