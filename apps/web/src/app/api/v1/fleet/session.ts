import { connection, type NextRequest, NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';

export function fleetJson(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export function withFleetSession(
  handler: (actorId: string, request: NextRequest) => Promise<NextResponse>,
  targetApp: 'mastermind' | ['platform', 'mastermind'] = [
    'platform',
    'mastermind',
  ]
) {
  const authenticated = withSessionAuth(
    (request, { user }) => handler(user.id, request),
    {
      allowAppSessionAuth: { targetApp },
      preferSupabaseSessionAuth: targetApp !== 'mastermind',
    }
  );

  return async (request: NextRequest) => {
    await connection();
    const response = await authenticated(request);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  };
}
