import { verifySecret } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export const HABITS_ENABLED_SECRET = 'ENABLE_HABITS';

export async function isHabitsEnabled(wsId: string) {
  return verifySecret({
    wsId,
    forceAdmin: true,
    name: HABITS_ENABLED_SECRET,
    value: 'true',
  });
}

export function habitsNotFoundResponse() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
