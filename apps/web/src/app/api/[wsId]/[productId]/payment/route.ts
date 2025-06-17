import { api } from '@/lib/polar';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
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

    metadata: {
      wsId: wsId,
    },
  });

  return NextResponse.redirect(checkoutSession.url);
}
