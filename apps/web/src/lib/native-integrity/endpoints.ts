import { enforceRequiredMfaRequest } from '@tuturuuu/utils/required-mfa-runtime';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { nativeIntegrityBody } from './request-body';
import { nativeIntegrityMode, nativeIntegrityRuntime } from './runtime';

const challengeSchema = z
  .object({
    purpose: z.enum(['request', 'enroll']),
    method: z.enum(['GET', 'PATCH']),
    path: z
      .string()
      .max(512)
      .regex(
        /^\/api\/v1\/(?:users\/calendar-settings|workspaces\/[a-zA-Z0-9_-]+\/calendar-settings)$/
      ),
    bodyHash: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    keyId: z.string().min(1).max(256).optional(),
  })
  .strict();
const enrollSchema = z
  .object({
    challengeId: z.string().regex(/^[A-Za-z0-9_-]{32,64}$/),
    keyId: z.string().min(1).max(256),
    attestation: z.string().min(1).max(32_768),
  })
  .strict();
function unavailable(
  mode: 'monitor' | 'enforce',
  status = 503,
  purpose: 'challenge' | 'enroll' = 'challenge'
) {
  return NextResponse.json(
    purpose === 'enroll'
      ? { verified: false }
      : { mode, verified: false, code: 'NATIVE_INTEGRITY_UNAVAILABLE' },
    {
      status: mode === 'monitor' ? 200 : status,
      headers: {
        'Cache-Control': 'private, no-store',
        ...(status === 429
          ? {
              'Retry-After': '60',
              'X-RateLimit-Policy': 'native-integrity-challenge',
              'X-RateLimit-Caller-Class': 'authenticated',
              'X-RateLimit-Window': 'minute',
            }
          : {}),
      },
    }
  );
}
export async function nativeIntegrityEndpoint(
  request: NextRequest,
  purpose: 'challenge' | 'enroll'
) {
  const mode = nativeIntegrityMode();
  if (mode === 'off')
    return NextResponse.json(
      purpose === 'enroll'
        ? { verified: false }
        : { mode: 'off', verified: false },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  const assurance = await enforceRequiredMfaRequest(request);
  if (assurance) return assurance;
  const auth = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: false,
  });
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = JSON.parse(
      Buffer.from(await nativeIntegrityBody(request, 48_000)).toString('utf8')
    );
  } catch {
    return unavailable(mode, 400, purpose);
  }
  try {
    const runtime = nativeIntegrityRuntime(auth.user.id);
    if (!runtime)
      return NextResponse.json(
        purpose === 'enroll'
          ? { verified: false }
          : { mode: 'off', verified: false }
      );
    if (purpose === 'challenge') {
      const parsed = challengeSchema.safeParse(body);
      if (!parsed.success) return unavailable(mode, 400, purpose);
      const issued = await runtime.issue({
        ...parsed.data,
        actorId: auth.user.id,
      });
      return NextResponse.json(issued, {
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }
    const parsed = enrollSchema.safeParse(body);
    if (!parsed.success) return unavailable(mode, 400, purpose);
    const result = await runtime.enroll({
      ...parsed.data,
      actorId: auth.user.id,
    });
    console.info('native-integrity', {
      mode,
      mechanism: 'app-attest',
      verdict: result.reason,
    });
    return NextResponse.json(
      { verified: result.reason === 'verified' },
      {
        status: result.allowed ? 200 : 403,
        headers: { 'Cache-Control': 'private, no-store' },
      }
    );
  } catch (error) {
    const status =
      error instanceof Error && 'status' in error && error.status === 429
        ? 429
        : 503;
    console.info('native-integrity', {
      mode,
      mechanism: purpose,
      verdict: 'unavailable',
    });
    return unavailable(mode, status, purpose);
  }
}
