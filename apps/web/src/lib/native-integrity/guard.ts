import {
  decodeNativeIntegrityProof,
  hashNativeIntegrityBody,
  type NativeIntegrityMechanism,
} from '@tuturuuu/internal-api/native-integrity';
import { type NextRequest, NextResponse } from 'next/server';
import { nativeIntegrityBody } from './request-body';
import { nativeIntegrityMode, nativeIntegrityRuntime } from './runtime';

function mechanism(value: string | null): NativeIntegrityMechanism {
  return value === 'app-attest' ||
    value === 'play-integrity' ||
    value === 'turnstile'
    ? value
    : 'none';
}
export async function guardNativeCalendarIntegrity(
  request: NextRequest,
  actorId: string
): Promise<NextResponse | null> {
  const mode = nativeIntegrityMode();
  if (mode === 'off') return null;
  const used = mechanism(request.headers.get('x-tuturuuu-native-integrity'));
  let reason = 'provider-unavailable';
  let allowed = mode !== 'enforce';
  try {
    const runtime = nativeIntegrityRuntime(actorId);
    if (!runtime) return null;
    const body =
      request.method === 'GET'
        ? new Uint8Array()
        : await nativeIntegrityBody(request.clone(), 1_048_576);
    if (body.length > 1_048_576)
      throw new Error('Integrity request body too large');
    const result = await runtime.verify({
      actorId,
      method: request.method === 'PATCH' ? 'PATCH' : 'GET',
      path: request.nextUrl.pathname,
      bodyHash: hashNativeIntegrityBody(body),
      mechanism: used,
      proof: decodeNativeIntegrityProof(
        request.headers.get('x-tuturuuu-integrity-proof')
      ),
    });
    reason = result.reason;
    allowed = result.allowed;
  } catch {
    // Monitoring cannot turn a verifier/configuration/storage outage into a lockout.
  }
  console.info('native-integrity', { mode, mechanism: used, verdict: reason });
  if (allowed) return null;
  return NextResponse.json(
    { code: 'NATIVE_INTEGRITY_REQUIRED', error: 'Forbidden' },
    {
      status: 403,
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Tuturuuu-Native-Integrity': mode,
      },
    }
  );
}
