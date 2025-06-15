// File: src/app/checkout/route.ts
// THIS IS THE NEW, CORRECT CODE THAT ADDS METADATA
import { payment } from '@/lib/payment';
import { api } from '@/lib/polar';
import { Checkout } from '@polar-sh/nextjs';
// console.log('Polar Access Token:', process.env.NEXT_PUBLIC_POLAR_ACCESS_TOKEN);
// export const GET = Checkout({
//   accessToken:
//     process.env.NEXT_PUBLIC_POLAR_ACCESS_TOKEN ||
//     'polar_oat_vabJzIQyCsDOIhjr9QBaLKELCNpdRuOe60E9m1h4PFt',
//   successUrl: '/success',
//   server: 'sandbox',
// });// File: src/app/api/[wsId]/[productId]/route.ts

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { wsId, productId } = await req.json();
  const client = payment;

  const session = await payment.createSession({
    product_id: productId,
    quantity: 1,
    metadata: { wsId },
    success_url: `/${wsId}/billing/success`,
  });

  return NextResponse.json({ url: session.checkout_url });
}
