import { getCheckoutStorefrontAccessByPublicToken } from '@tuturuuu/inventory-core/commerce/checkouts';
import {
  completeInventorySquarePosCallback,
  parseSquarePosCallback,
  SquarePosCallbackError,
} from '@tuturuuu/inventory-core/commerce/square';
import { NextResponse } from 'next/server';
import { STOREFRONT_APP_URL } from '@/constants/common';

async function callbackParams(request: Request) {
  const params = new URL(request.url).searchParams;
  if (request.method !== 'POST') return params;

  try {
    const form = await request.formData();
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') params.set(key, value);
    }
  } catch {
    // Android returns query parameters. Some Square clients POST the callback
    // URL without a form body, so the URL remains the source of truth.
  }
  return params;
}

async function handleCallback(request: Request) {
  try {
    const outcome = await completeInventorySquarePosCallback(
      parseSquarePosCallback(await callbackParams(request))
    );
    const access = await getCheckoutStorefrontAccessByPublicToken(
      outcome.checkout.publicToken
    );
    if (!access) {
      return NextResponse.json({ message: 'Order not found' }, { status: 404 });
    }

    const destination = new URL(
      `/${access.storefrontSlug}/orders/${outcome.checkout.publicToken}`,
      STOREFRONT_APP_URL
    );
    destination.searchParams.set('square_pos', outcome.outcome);
    return NextResponse.redirect(destination, 303);
  } catch (error) {
    const message =
      error instanceof SquarePosCallbackError
        ? error.message
        : 'Square POS callback could not be verified';
    console.error('Failed to process Square POS callback', { error: message });
    return NextResponse.json(
      { message },
      {
        headers: { 'Cache-Control': 'private, no-store' },
        status: error instanceof SquarePosCallbackError ? 400 : 500,
      }
    );
  }
}

export function GET(request: Request) {
  return handleCallback(request);
}

export function POST(request: Request) {
  return handleCallback(request);
}
