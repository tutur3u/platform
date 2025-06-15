// File: src/app/checkout/route.ts
// THIS IS THE NEW, CORRECT CODE THAT ADDS METADATA
import { api } from '@/lib/polar';
import { Checkout } from '@polar-sh/nextjs';
// Your configured Polar SDK client
import { NextRequest, NextResponse } from 'next/server';

// console.log('Polar Access Token:', process.env.NEXT_PUBLIC_POLAR_ACCESS_TOKEN);
// export const GET = Checkout({
//   accessToken:
//     process.env.NEXT_PUBLIC_POLAR_ACCESS_TOKEN ||
//     'polar_oat_vabJzIQyCsDOIhjr9QBaLKELCNpdRuOe60E9m1h4PFt',
//   successUrl: '/success',
//   server: 'sandbox',
// });
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; productId: string }> }
) {
  const { wsId, productId } = await params;
  // Validate that you have the info you need
  if (!productId || !wsId) {
    return new Response('Product ID and Workspace ID are required', {
      status: 400,
    });
  }

  // HERE is where you add the metadata
  const checkoutSession = await api.checkouts.create({
    products: [productId],
    successUrl: `http://localhost:7803/${wsId}/billing/success`,
    // Attach your internal workspaceId so you can get it back in the webhook
    metadata: {
      wsId: wsId,
    },
  });

  // Return the session details to the Polar Embed script so it can show the popup
  return NextResponse.redirect(checkoutSession.url);
}
