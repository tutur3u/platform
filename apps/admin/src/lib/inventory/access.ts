import { NextResponse } from 'next/server';

export const INVENTORY_ENABLED_SECRET = 'ENABLE_INVENTORY';

/**
 * Inventory is generally available — it is no longer gated behind the
 * `ENABLE_INVENTORY` workspace secret. The helper is kept (and always resolves
 * `true`) so the many existing call sites keep compiling, but it no longer
 * blocks access. This also unblocks public storefront reads, which previously
 * 404'd whenever the secret was missing even for a published storefront.
 */
export async function isInventoryEnabled(_wsId: string) {
  return true;
}

export function inventoryNotFoundResponse() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
