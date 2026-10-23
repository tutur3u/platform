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

  let runner: Awaited<ReturnType<typeof verifyDevboxRunnerToken>>;
  try {
    runner = await verifyDevboxRunnerToken(token, options);
  } catch (error) {
    // A storage brownout is not a credential verdict: agents treat 401 as
    // fatal, so answer 503 and let them retry instead of exiting and flapping.
    console.error('Devbox runner authorization unavailable:', error);
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: 'Devbox authorization temporarily unavailable' },
        { headers: { 'Retry-After': '5' }, status: 503 }
      ),
    };
  }
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
