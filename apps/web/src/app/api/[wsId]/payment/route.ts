// File: src/app/checkout/route.ts
// This code is for the EMBEDDED / POPUP method
import { Checkout } from '@polar-sh/nextjs';
// api/webhook/polar/route.ts
import { Webhooks } from '@polar-sh/nextjs';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const productId = request.nextUrl.searchParams.get('productId');

  if (!productId) {
    return new Response('Product ID is required', { status: 400 });
  }

  return Checkout({
    accessToken: process.env.NEXT_PUBLIC_POLAR_ACCESS_TOKEN || '',
    successUrl: `${request.nextUrl.origin}/success`,
    server: 'sandbox',
  });
}

