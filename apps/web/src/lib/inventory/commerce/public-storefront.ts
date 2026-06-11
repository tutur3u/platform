import 'server-only';

import type { InventoryPublicStorefrontResponse } from '@tuturuuu/internal-api/inventory';
import { createAdminClient } from '@tuturuuu/supabase/next/server';

export async function getPublicStorefront(slug: string) {
  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('get_public_inventory_storefront', {
      p_storefront_slug: slug,
    });

  if (error) throw error;

  return (data as InventoryPublicStorefrontResponse | null) ?? null;
}
