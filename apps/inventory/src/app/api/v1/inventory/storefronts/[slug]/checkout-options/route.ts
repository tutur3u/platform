import { isInventoryEnabled } from '@tuturuuu/inventory-core/access';
import { getPublicStorefront } from '@tuturuuu/inventory-core/commerce/public-storefront';
import { NextResponse } from 'next/server';
import { authorizeSquareCheckoutStaff } from '@/lib/square-checkout-access';
import { resolveSquareCheckoutMethod } from '@/lib/square-checkout-method';

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

    const configuredCheckoutMode = payload.storefront.checkoutMode;
    if (
      configuredCheckoutMode !== 'square_pos' &&
      configuredCheckoutMode !== 'square_terminal'
    ) {
      return NextResponse.json({
        checkoutMode: configuredCheckoutMode,
        routing: 'not_applicable',
        staffAuthorized: true,
      });
    }

    const authorization = await authorizeSquareCheckoutStaff(
      request,
      payload.storefront.wsId
    );
    if (!authorization.ok) return authorization.response;

    const method = await resolveSquareCheckoutMethod({
      configuredCheckoutMode,
      wsId: payload.storefront.wsId,
    });

    if (method.checkoutMode === 'square_pos') {
      return NextResponse.json({
        checkoutMode: method.checkoutMode,
        configuredCheckoutMode,
        defaultDeviceId: null,
        devices: [],
        fallbackApplied: method.fallbackApplied,
        routing: 'current_device',
        staffAuthorized: true,
      });
    }

    const routing = method.terminalRouting;
    if (!routing) {
      throw new Error('Square Terminal routing was not resolved.');
    }
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
      checkoutMode: method.checkoutMode,
      configuredCheckoutMode,
      defaultDeviceId: routing.defaultDeviceId,
      devices,
      fallbackApplied: false,
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
