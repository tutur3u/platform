import { connection, type NextRequest, NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';

export function fleetJson(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export function withFleetSession(
  handler: (actorId: string) => Promise<NextResponse>
) {
  const authenticated = withSessionAuth(
    (_request, { user }) => handler(user.id),
    {
      allowAppSessionAuth: { targetApp: ['platform', 'mastermind'] },
      preferSupabaseSessionAuth: true,
    }
  );

  return async (request: NextRequest) => {
    await connection();
    const response = await authenticated(request);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  };
}
