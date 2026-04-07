import { verifySecret } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export const INVENTORY_ENABLED_SECRET = 'ENABLE_INVENTORY';

export async function isInventoryEnabled(wsId: string) {
  return verifySecret({
    wsId,
    forceAdmin: true,
    name: INVENTORY_ENABLED_SECRET,
    value: 'true',
  });
}

export function inventoryNotFoundResponse() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
