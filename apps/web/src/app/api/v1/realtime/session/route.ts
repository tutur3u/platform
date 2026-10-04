import { connection, NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { noStore, realtimeAuth } from '../route-utils';
export const GET = withSessionAuth(async (_request, { user }) => {
  await connection();
  return NextResponse.json(
    { id: user.id, email: user.email, user_metadata: user.user_metadata ?? {} },
    { headers: noStore }
  );
}, realtimeAuth);
