import { isInventoryEnabled } from '@tuturuuu/inventory-core/access';
import { getPublicStorefront } from '@tuturuuu/inventory-core/commerce/public-storefront';
import { getInventorySquareCheckoutRouting } from '@tuturuuu/inventory-core/commerce/square';
import { NextResponse } from 'next/server';
import { authorizeSquareCheckoutStaff } from '@/lib/square-checkout-access';

interface Params {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const payload = await getPublicStorefront(slug);

    if (!payload || !(await isInventoryEnabled(payload.storefront.wsId))) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    const checkoutMode = payload.storefront.checkoutMode;
    if (checkoutMode !== 'square_pos' && checkoutMode !== 'square_terminal') {
      return NextResponse.json({
        checkoutMode,
        routing: 'not_applicable',
        staffAuthorized: true,
      });
    }

    const authorization = await authorizeSquareCheckoutStaff(
      request,
      payload.storefront.wsId
    );
    if (!authorization.ok) return authorization.response;

    if (checkoutMode === 'square_pos') {
      return NextResponse.json({
        checkoutMode,
        defaultDeviceId: null,
        devices: [],
        routing: 'current_device',
        staffAuthorized: true,
      });
    }

    const routing = await getInventorySquareCheckoutRouting(
      payload.storefront.wsId
    );
    const devices =
      routing.devices.length === 0 &&
      routing.environment === 'sandbox' &&
      routing.defaultDeviceId
        ? [
            {
              code: null,
              id: routing.defaultDeviceId,
              locationId: routing.locationId,
              name: 'Square Sandbox Terminal',
              pairedAt: null,
              productType: 'TERMINAL_API',
              status: 'SANDBOX',
              updatedAt: null,
            },
          ]
        : routing.devices;

    return NextResponse.json({
      checkoutMode,
      defaultDeviceId: routing.defaultDeviceId,
      devices,
      routing: 'selected_terminal',
      staffAuthorized: true,
    });
  } catch (error) {
    console.error('Failed to load Square checkout options', error);
    return NextResponse.json(
      { message: 'Unable to load Square checkout routing.' },
      { status: 500 }
    );
  }
}
