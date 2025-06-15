// File: src/app/checkout/route.ts
// THIS IS THE NEW, CORRECT CODE THAT ADDS METADATA
// console.log('Polar Access Token:', process.env.NEXT_PUBLIC_POLAR_ACCESS_TOKEN);
// export const GET = Checkout({
//   accessToken:
//     process.env.NEXT_PUBLIC_POLAR_ACCESS_TOKEN ||
//     'polar_oat_vabJzIQyCsDOIhjr9QBaLKELCNpdRuOe60E9m1h4PFt',
//   successUrl: '/success',
//   server: 'sandbox',
// });// File: src/app/api/[wsId]/[productId]/route.ts
import { dodopayments } from '@/lib/payment';
import { api } from '@/lib/polar';
import { Checkout } from '@polar-sh/nextjs';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  // { params }: { params: { wsId: string; productId: string } }
  { params }: { params: Promise<{ wsId: string; productId: string }> }
) {
  const { wsId, productId } = await params;

  // Validate that you have the info you need
  if (!productId || !wsId) {
    return new Response('Product ID and Workspace ID are required', {
      status: 400,
    });
  }

  const productWithQuantity = { product_id: productId, quantity: 1 };
  // HERE is where you add the metadata
  const checkoutSession = await dodopayments.payments.create({
    billing: {
      city: '',
      country: 'VN',
      state: '',
      street: '',
      zipcode: '',
    },
    customer: {
      email: 't@test.com',
      name: '',
    },
    product_cart: [productWithQuantity],
    payment_link: true,
    return_url: `${request.url}/success`,
    metadata: {
      wsId: wsId, // Attach your internal workspaceId so you can get it back in the webhook
      productId: productId, // Attach the product ID for reference
    },
  });

  // Return the session details to the Polar Embed script so it can show the popup
  return NextResponse.json(checkoutSession);
}
