import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { checkEnvVariables } from '@tuturuuu/supabase/next/common';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { readBoundedResponseBytes } from '@tuturuuu/utils/read-bounded-response';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  fleetSmokeEmail,
  fleetSmokeFactorName,
  fleetSmokePasswordPattern,
  fleetSmokeRequestIdPattern,
  fleetSmokeTotp,
} from '@/lib/auth/fleet-smoke/identity';

const operationSchema = z.object({
  requestId: z.string().regex(fleetSmokeRequestIdPattern),
  state: z.enum(['pending', 'active', 'retired']),
  workspaceId: z.uuid().nullable(),
  activatedAt: z.string().nullable(),
  previousId: z.uuid().nullable(),
});

function authorize(request: NextRequest) {
  const token = process.env.TUTURUUU_FLEET_SMOKE_PROVISIONER_TOKEN ?? '';
  const expiry = Date.parse(
    process.env.TUTURUUU_FLEET_SMOKE_PROVISIONER_EXPIRES_AT ?? ''
  );
  const remaining = expiry - Date.now();
  const header = request.headers.get('authorization') ?? '';
  const origin = request.nextUrl.origin;
  if (
    !origin.startsWith('https://') ||
    origin !== process.env.TUTURUUU_FLEET_SMOKE_PROVISIONER_ORIGIN ||
    !Number.isFinite(remaining) ||
    remaining <= 0 ||
    remaining > 86_400_000 ||
    !/^[a-zA-Z0-9_-]{43,128}$/u.test(token) ||
    !/^Bearer [a-zA-Z0-9_-]{43,128}$/u.test(header)
  ) {
    return false;
  }
  const hash = (text: string) => createHash('sha256').update(text).digest();
  return timingSafeEqual(hash(header.slice(7)), hash(token));
}

function json(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

async function handle(
  request: NextRequest,
  command: 'provision' | 'read' | 'retire'
) {
  if (!authorize(request)) return json({ error: 'Not found' }, 404);

  const requestId = request.headers.get('x-fleet-smoke-request-id') ?? '';
  if (!fleetSmokeRequestIdPattern.test(requestId)) {
    return json({ error: 'Invalid request ID' }, 400);
  }

  let password: string | undefined;
  if (command === 'provision') {
    try {
      const bytes = await readBoundedResponseBytes({
        response: request,
        maxBytes: 64,
      });
      password = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return json({ error: 'Invalid credential input' }, 400);
    }
    if (!fleetSmokePasswordPattern.test(password)) {
      return json({ error: 'Invalid credential input' }, 400);
    }
  }

  try {
    const admin = await createAdminClient({ noCookie: true });
    const transition = async (
      action: 'read' | 'reserve' | 'activate' | 'retire',
      factorId?: string
    ) => {
      const { data, error } = await admin
        .schema('private')
        .rpc('fleet_smoke_transition', {
          p_id: requestId,
          p_action: action,
          ...(factorId ? { p_factor: factorId } : {}),
        });
      if (error) throw new Error('Fleet smoke transition unavailable');
      return operationSchema.nullable().parse(data);
    };

    if (password === undefined) {
      if (command === 'provision') throw new Error();
      const operation = await transition(command);
      return operation ? json(operation) : json({ error: 'Not found' }, 404);
    }

    const reservation = await transition('reserve');
    if (!reservation)
      return json({ error: 'Request not reserved', requestId }, 409);

    const email = fleetSmokeEmail(requestId);
    const enrollmentPassword = randomBytes(32).toString('base64url');
    const { url, key } = checkEnvVariables();
    const enrollmentClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const created = await admin.auth.admin.createUser({
      id: requestId,
      email,
      password: enrollmentPassword,
      email_confirm: true,
      user_metadata: { display_name: '[QA] Fleet smoke' },
      app_metadata: {
        tuturuuu_fleet_smoke: true,
        tuturuuu_required_mfa: {
          required: true,
          recoveryInProgress: true,
          verifiedAfter: 0,
        },
      },
    });
    if (created.error || created.data.user.id !== requestId) throw new Error();

    const signIn = await enrollmentClient.auth.signInWithPassword({
      email,
      password: enrollmentPassword,
    });
    if (signIn.error || signIn.data.user.id !== requestId) throw new Error();
    const enrolled = await enrollmentClient.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: fleetSmokeFactorName,
    });
    if (enrolled.error) throw new Error();
    const { id: factorId, totp } = enrolled.data;
    const verified = await enrollmentClient.auth.mfa.challengeAndVerify({
      factorId,
      code: fleetSmokeTotp(totp.secret),
    });
    if (verified.error) throw new Error();
    const signedOut = await enrollmentClient.auth.signOut({ scope: 'local' });
    if (signedOut.error) throw new Error();

    const updated = await admin.auth.admin.updateUserById(requestId, {
      password,
    });
    if (updated.error) throw new Error();
    const onboarding = await admin.from('onboarding_progress').upsert({
      user_id: requestId,
      completed_steps: ['welcome', 'use_case', 'profile', 'celebration'],
      current_step: 'celebration',
      profile_completed: true,
      completed_at: new Date().toISOString(),
      use_case: 'personal',
      flow_type: 'personal',
      notifications_enabled: false,
    });
    if (onboarding.error) throw new Error();
    const active = await transition('activate', factorId);
    if (!active || active.state !== 'active' || !active.workspaceId)
      throw new Error();
    return json({ ...active, email, totpSecret: totp.secret }, 201);
  } catch {
    console.warn(
      '[fleet-smoke] Reconcile operation before continuing',
      requestId
    );
    return json(
      { error: 'Operation unavailable; reconcile by request ID', requestId },
      503
    );
  }
}

export function GET(request: NextRequest) {
  return handle(request, 'read');
}

export function POST(request: NextRequest) {
  return handle(request, 'provision');
}

export function DELETE(request: NextRequest) {
  return handle(request, 'retire');
}
