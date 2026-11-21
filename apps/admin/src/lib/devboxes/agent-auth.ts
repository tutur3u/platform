import { NextResponse } from 'next/server';
import { verifyDevboxRunnerToken } from './store';

function getBearerToken(request: Request) {
  const authorization = request.headers.get('authorization')?.trim();
  if (!authorization?.toLowerCase().startsWith('bearer ')) return null;
  return authorization.slice('bearer '.length).trim();
}

export async function authorizeDevboxAgent(
  request: Request,
  options: { requireOnline?: boolean } = {}
) {
  const token =
    request.headers.get('x-devbox-runner-token')?.trim() ??
    getBearerToken(request);

  if (!token) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  const runner = await verifyDevboxRunnerToken(token, options).catch(
    () => null
  );
  if (!runner) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  return {
    ok: true as const,
    runner,
  };
}
