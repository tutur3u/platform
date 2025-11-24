import { createPolarClient } from '@tuturuuu/payment/polar/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { PORT } from '@/constants/common';

export async function POST(request: NextRequest) {
  const BASE_URL =
    process.env.NODE_ENV === 'development'
      ? `http://localhost:${PORT}`
      : 'https://tuturuuu.com';

  const { wsId, productId, sandbox } = await request.json();

  // Validate that you have the info you need
  if (!productId || !wsId) {
    return new Response('Product ID and Workspace ID are required', {
      status: 400,
    });
  }

  const supabase = await createClient();
  const user = await getCurrentSupabaseUser();

  const { data, error } = await supabase
    .from('users')
    .select('display_name')
    .eq('id', user?.id || '')
    .single();

  if (error) {
    console.error('Error fetching user display name:', error);
    return new Response('Error fetching user display name', {
      status: 500,
    });
  }

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

  const polarClient = createPolarClient({
    sandbox:
      // Always use sandbox for development
      process.env.NODE_ENV === 'development'
        ? true
        : // If the workspace is the root workspace and the sandbox is true, use sandbox
          !!(wsId === ROOT_WORKSPACE_ID && sandbox), // Otherwise, use production
  });

  // HERE is where you add the metadata
  const checkoutSession = await polarClient.checkouts.create({
    products: [productId],
    successUrl: `${BASE_URL}/${wsId}/billing/success`,
    externalCustomerId: user?.id || '',
    metadata: {
      wsId,
    },
    customerName: data.display_name,
    customerEmail: user?.email,
  });

  const checkoutUrl = checkoutSession.url;

  return NextResponse.json({ url: checkoutUrl });
}
