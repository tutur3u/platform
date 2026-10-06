import { connection, NextResponse } from 'next/server';
import {
  authorizeDesktopAdmin,
  desktopAdminFailure,
  validateDesktopMutation,
} from '@/lib/desktop-deployment/access';
import { applyDesktopMutation } from '@/lib/desktop-deployment/mutations';
import {
  DesktopMutationSchema,
  readDesktopBody,
} from '@/lib/desktop-deployment/request';
import {
  DesktopAdminStoreError,
  listDesktopVaultState,
} from '@/lib/desktop-deployment/store';

function desktopRouteError(error: unknown) {
  if (error instanceof DesktopAdminStoreError)
    return desktopAdminFailure(error.status, error.code);
  return desktopAdminFailure(500, 'desktop_operation_unavailable');
}

export async function GET(request: Request) {
  await connection();
  const access = await authorizeDesktopAdmin(request);
  if (!access.ok) return access.response;
  try {
    return NextResponse.json(await listDesktopVaultState(access.db), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return desktopRouteError(error);
  }
}

export async function POST(request: Request) {
  const csrf = validateDesktopMutation(request);
  if (csrf) return csrf;
  const access = await authorizeDesktopAdmin(request);
  if (!access.ok) return access.response;
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json')
    return desktopAdminFailure(415, 'desktop_request_invalid');
  let bytes: Buffer | undefined;
  try {
    bytes = await readDesktopBody(request, 65536);
    let payload: unknown;
    try {
      payload = JSON.parse(bytes.toString('utf8'));
    } catch {
      return desktopAdminFailure(400, 'desktop_request_invalid');
    }
    const parsed = DesktopMutationSchema.safeParse(payload);
    if (!parsed.success)
      return desktopAdminFailure(400, 'desktop_request_invalid');
    if (parsed.data.action === 'create_token') {
      const expires = new Date(parsed.data.expiresAt).getTime();
      if (expires <= Date.now() || expires > Date.now() + 30 * 86400000)
        return desktopAdminFailure(400, 'desktop_token_expiry_invalid');
    }
    const token = await applyDesktopMutation(
      access.db,
      access.userId,
      parsed.data
    );
    const state = await listDesktopVaultState(access.db);
    return NextResponse.json(
      { state, ...(token ? { token } : {}) },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return desktopRouteError(error);
  } finally {
    bytes?.fill(0);
  }
}
