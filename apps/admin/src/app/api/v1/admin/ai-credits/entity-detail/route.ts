import { connection, type NextRequest, NextResponse } from 'next/server';
import { authorizeAiCreditsAdminRequest } from '../access';

export async function GET(req: NextRequest) {
  await connection();

  try {
    const auth = await authorizeAiCreditsAdminRequest();
    if (!auth.ok) return auth.response;

    const wsId = req.nextUrl.searchParams.get('ws_id');
    const userId = req.nextUrl.searchParams.get('user_id');

    if (!wsId && !userId) {
      return NextResponse.json(
        { error: 'Must provide ws_id or user_id' },
        { status: 400 }
      );
    }

    const rpcParams: Record<string, unknown> = {};
    if (wsId) rpcParams.p_ws_id = wsId;
    if (userId) rpcParams.p_user_id = userId;

    const { sbAdmin } = auth;
    const { data, error } = await sbAdmin.rpc(
      'admin_get_ai_credit_entity_detail' as any,
      rpcParams
    );

    if (error) {
      console.error('Error getting entity detail:', error);
      return NextResponse.json(
        { error: 'Failed to get entity detail' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in admin entity-detail route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
