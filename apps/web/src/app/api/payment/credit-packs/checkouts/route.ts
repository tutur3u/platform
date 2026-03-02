import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { BASE_URL } from '@/constants/common';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

export async function POST(request: NextRequest) {
  const baseUrl = BASE_URL;

  let wsId: string | undefined;
  let creditPackId: string | undefined;
  try {
    const body = await request.json();
    wsId = body?.wsId;
    creditPackId = body?.creditPackId;
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Invalid JSON payload',
        message: error instanceof Error ? error.message : 'Malformed JSON body',
      },
      { status: 400 }
    );
  }

  if (!wsId || !creditPackId) {
    return NextResponse.json(
      { error: 'Workspace ID and credit pack ID are required' },
      { status: 400 }
    );
  }

  const normalizedWsId = await normalizeWorkspaceId(wsId);

  const supabase = await createClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: hasPermission, error: permissionError } = await supabase.rpc(
    'has_workspace_permission',
    {
      p_user_id: user.id,
      p_ws_id: normalizedWsId,
      p_permission: 'manage_subscription',
    }
  );

  if (permissionError) {
    return NextResponse.json(
      { error: permissionError.message },
      { status: 500 }
    );
  }

  if (!hasPermission) {
    return NextResponse.json(
      { error: 'Unauthorized: missing billing permission' },
      { status: 403 }
    );
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .select('id')
    .eq('id', normalizedWsId)
    .maybeSingle();

  if (workspaceError) {
    return NextResponse.json(
      { error: workspaceError.message },
      { status: 500 }
    );
  }

  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }

  const { data: creditPack, error: packError } = await supabase
    .from('workspace_credit_packs')
    .select('id, archived')
    .eq('id', creditPackId)
    .maybeSingle();

  if (packError) {
    return NextResponse.json({ error: packError.message }, { status: 500 });
  }

  if (!creditPack || creditPack.archived) {
    return NextResponse.json(
      { error: 'Credit pack is unavailable' },
      { status: 404 }
    );
  }

  try {
    const polar = createPolarClient();
    const checkoutSession = await polar.checkouts.create({
      metadata: {
        wsId: normalizedWsId,
      },
      products: [creditPackId],
      requireBillingAddress: true,
      embedOrigin: baseUrl,
      successUrl: `${baseUrl}/${normalizedWsId}/billing/success?checkoutId={CHECKOUT_ID}`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error('Failed to create credit pack checkout:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
