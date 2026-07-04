import { isInventoryEnabled } from '@tuturuuu/inventory-core/access';
import { getPublicStorefront } from '@tuturuuu/inventory-core/commerce/public-storefront';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const storefrontAnalyticsEventSchema = z.object({
  checkoutSessionId: z.guid().nullable().optional(),
  eventType: z.enum([
    'add_to_cart',
    'banner_click',
    'checkout_completed',
    'checkout_created',
    'checkout_failed',
    'checkout_started',
    'product_view',
    'remove_from_cart',
    'view',
  ]),
  listingId: z.guid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  quantity: z.number().int().positive().nullable().optional(),
  sectionId: z.guid().nullable().optional(),
});

interface Params {
  params: Promise<{ slug: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const storefrontPayload = await getPublicStorefront(slug);

    if (
      !storefrontPayload ||
      !(await isInventoryEnabled(storefrontPayload.storefront.wsId))
    ) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    if (!storefrontPayload.storefront.analyticsEnabled) {
      return NextResponse.json({ ok: true });
    }

    const payload = storefrontAnalyticsEventSchema.parse(await request.json());
    const sbAdmin = await createAdminClient();
    const { error } = await sbAdmin
      .schema('private')
      .from('inventory_storefront_events' as never)
      .insert({
        checkout_session_id: payload.checkoutSessionId ?? null,
        event_type: payload.eventType,
        listing_id: payload.listingId ?? null,
        metadata: payload.metadata ?? {},
        quantity: payload.quantity ?? null,
        section_id: payload.sectionId ?? null,
        storefront_id: storefrontPayload.storefront.id,
        ws_id: storefrontPayload.storefront.wsId,
      } as never);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          message: 'Invalid storefront analytics payload',
          errors: error.issues,
        },
        { status: 400 }
      );
    }

    console.error('Failed to record storefront analytics event', error);
    return NextResponse.json(
      { message: 'Failed to record storefront analytics event' },
      { status: 500 }
    );
  }
}
