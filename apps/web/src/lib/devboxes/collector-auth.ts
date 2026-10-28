import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { identityRpc } from './identity-store';
export async function authorizeDevboxCollector(request: Request) {
  const token = request.headers.get('X-Devbox-Collector-Token') ?? '';
  const denied = (message: string, status: number) => ({
    ok: false as const,
    response: NextResponse.json(
      { message },
      { status, headers: { 'Cache-Control': 'no-store' } }
    ),
  });
  if (
    !/^tdbc_[a-f0-9]{64}$/.test(token) ||
    request.headers.has('X-Devbox-Runner-Token') ||
    request.headers.has('X-Devbox-Access-Token')
  )
    return denied('Unauthorized', 401);
  try {
    const valid = await identityRpc('authenticate_devbox_host_collector', {
      p_hash: createHash('sha256').update(token).digest('hex'),
    });
    return valid === true ? { ok: true as const } : denied('Unauthorized', 401);
  } catch {
    return denied('Unavailable', 503);
  }
}
