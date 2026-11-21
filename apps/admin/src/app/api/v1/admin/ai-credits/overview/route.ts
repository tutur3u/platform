import { connection, NextResponse } from 'next/server';
import { authorizeAiCreditsAdminRequest } from '../access';

export async function GET() {
  await connection();

  try {
    const auth = await authorizeAiCreditsAdminRequest();
    if (!auth.ok) return auth.response;

    const { sbAdmin } = auth;
    const { data, error } = await sbAdmin.rpc(
      'get_platform_ai_credit_overview'
    );

    if (error) {
      console.error('Error getting platform overview:', error);
      return NextResponse.json(
        { error: 'Failed to get platform overview' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in admin overview route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
