import { createClient } from '@tuturuuu/supabase/next/server';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { connection, NextResponse } from 'next/server';
import { AppealError, type AppealErrorCode } from './domain';
import { isEmailAppealsEnabled } from './flag';

const STATUS: Record<AppealErrorCode, number> = {
  invalid_request: 400,
  invalid_token: 400,
  expired_token: 410,
  forbidden: 403,
  flag_disabled: 403,
  rate_limited: 429,
  cooldown: 429,
  not_appealable: 409,
  deliverability_failed: 422,
  transport_unavailable: 503,
  store_unavailable: 503,
};

export function appealJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'cache-control': 'private, no-store',
      'referrer-policy': 'no-referrer',
    },
  });
}

export function appealErrorResponse(error: unknown) {
  const code = error instanceof AppealError ? error.code : 'store_unavailable';
  return appealJson({ error: code }, STATUS[code]);
}

export function isSameOriginMutation(request: Request): boolean {
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  return (
    origin === new URL(request.url).origin && (!site || site === 'same-origin')
  );
}

export async function readAppealJson(request: Request): Promise<unknown> {
  if (!isSameOriginMutation(request)) throw new AppealError('forbidden');
  const reader = request.body?.getReader();
  if (!reader) throw new AppealError('invalid_request');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new AppealError('invalid_request');
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof AppealError) throw error;
    throw new AppealError('invalid_request');
  } finally {
    reader.releaseLock();
  }
}

export async function requireAppealAdmin(request: Request, wsId: string) {
  await connection();
  const supabase = await createClient(request);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user || !isVerifiedTuturuuuStaffSession(user)) {
    return {
      ok: false as const,
      response: appealJson({ error: 'forbidden' }, 403),
    };
  }
  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  const membership = await supabase
    .from('workspace_members')
    .select('type')
    .eq('ws_id', normalizedWsId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (membership.error) throw new AppealError('store_unavailable');
  if (membership.data?.type !== 'MEMBER') {
    return {
      ok: false as const,
      response: appealJson({ error: 'forbidden' }, 403),
    };
  }
  const permissions = await getPermissions({ user, wsId: normalizedWsId });
  if (!permissions || permissions.withoutPermission('admin')) {
    return {
      ok: false as const,
      response: appealJson({ error: 'forbidden' }, 403),
    };
  }
  if (!(await isEmailAppealsEnabled(normalizedWsId))) {
    return {
      ok: false as const,
      response: appealJson({ error: 'flag_disabled' }, 403),
    };
  }
  return { ok: true as const, wsId: normalizedWsId, actorId: user.id };
}

export async function requireAppealRecipient(request: Request) {
  await connection();
  const supabase = await createClient(request);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user?.email_confirmed_at || !user.email) {
    throw new AppealError('forbidden');
  }
  return { actorId: user.id, email: user.email.trim().toLowerCase() };
}
