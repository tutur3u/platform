import { verifySecret } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { FEE_LOCK_ENABLED_SECRET } from './constants';

/** Server-only flag check; pass the resolved workspace id. */
export async function isFeeLockEnabled(wsId: string): Promise<boolean> {
  try {
    return await verifySecret({
      wsId,
      forceAdmin: true,
      name: FEE_LOCK_ENABLED_SECRET,
      value: 'true',
    });
  } catch {
    return false;
  }
}

export function feeLockNotFoundResponse() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

/**
 * Returns the 404 response every fee-lock page and API uses while the flag is
 * off, or null when the feature is enabled for the workspace.
 */
export async function requireFeeLockEnabled(
  wsId: string
): Promise<NextResponse | null> {
  return (await isFeeLockEnabled(wsId)) ? null : feeLockNotFoundResponse();
}
