import { api } from '@/lib/polar';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ wsId: string; productId: string }> }
) {
  // const sbAdmin = await createAdminClient();
  // const user = await getCurrentSupabaseUser();

  const { wsId, productId } = await params;
  const supabase = await createClient();

  const { data: isCreatorAllowed, error: rpcError } = await supabase.rpc(
    'check_ws_creator',
    {
      ws_id: wsId,
    }
  );

  if (rpcError) {
    console.error('Error checking workspace creator:', rpcError);
    return new Response(`Error checking creator status: ${rpcError.message}`, {
      status: 500,
    });
  }

  if (!isCreatorAllowed) {
    console.warn(
      `User (auth.uid()) is not authorized to create subscription for wsId: ${wsId} or subscription already exists.`
    );
    return new Response(
      'Unauthorized: You are not the workspace creator or an active subscription already exists.',
      {
        status: 403, // Forbidden
      }
    );
  }
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
