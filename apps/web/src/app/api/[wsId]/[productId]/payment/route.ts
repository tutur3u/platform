import { createClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { createPolarClient } from '@/lib/polar';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; productId: string }> }
) {
  const searchParams = request.nextUrl.searchParams;
  const sandbox = searchParams.get('sandbox') === 'true';

  const BASE_URL =
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:7803'
      : 'https://tuturuuu.com';

  // const sbAdmin = await createAdminClient();
  const user = await getCurrentSupabaseUser();

  const { wsId, productId } = await params;
  const supabase = await createClient();

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
  // Validate that you have the info you need
  if (!productId || !wsId) {
    return new Response('Product ID and Workspace ID are required', {
      status: 400,
    });
  }

  const polarClient = createPolarClient({
    sandbox:
      // Always use sandbox for development
      process.env.NODE_ENV === 'development'
        ? true
        : // If the workspace is the root workspace and the sandbox is true, use sandbox
          wsId === ROOT_WORKSPACE_ID && sandbox
          ? true // Enable sandbox for root workspace
          : false, // Otherwise, use production
  });

  // HERE is where you add the metadata
  const checkoutSession = await polarClient.checkouts.create({
    products: [productId],
    successUrl: `${BASE_URL}/${wsId}/billing/success`,
    // externalCustomerId: user?.id || '',
    metadata: {
      wsId: wsId,
    },
  });

  return NextResponse.redirect(
    checkoutSession.url +
      `?customerEmail=${user?.email}&customer_name=${data.display_name}`
  );
}
