import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';

export async function POST() {
  const supabase = await createClient();
  const sbAdmin = await createAdminClient();

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify root workspace membership and permission
  const { data: hasPermission, error: permissionError } = await supabase.rpc(
    'has_workspace_permission',
    {
      p_user_id: user.id,
      p_ws_id: ROOT_WORKSPACE_ID,
      p_permission: 'manage_workspace_roles',
    }
  );

  if (permissionError || !hasPermission) {
    return NextResponse.json(
      { error: 'Unauthorized: Admin access required' },
      { status: 403 }
    );
  }

  let created = 0;
  let skipped = 0;
  let errors = 0;
  const errorDetails: Array<{ id: string; error: string }> = [];

  try {
    // Find all workspaces
    const { data: allWorkspaces, error: wsError } = await sbAdmin
      .from('workspaces')
      .select('id, personal');

    if (wsError) {
      console.error('Error fetching workspaces:', wsError);
      return NextResponse.json(
        { error: 'Failed to fetch workspaces' },
        { status: 500 }
      );
    }

    if (!allWorkspaces || allWorkspaces.length === 0) {
      return NextResponse.json({
        created: 0,
        skipped: 0,
        errors: 0,
        message: 'No workspaces found',
      });
    }

    // Get all active subscriptions
    const { data: activeSubscriptions, error: subError } = await sbAdmin
      .from('workspace_subscriptions')
      .select('ws_id')
      .eq('status', 'active');

    if (subError) {
      console.error('Error fetching subscriptions:', subError);
      return NextResponse.json(
        { error: 'Failed to fetch subscriptions' },
        { status: 500 }
      );
    }

    // Filter workspaces without active subscriptions
    const activeWsIds = new Set(
      activeSubscriptions?.map((sub) => sub.ws_id) || []
    );
    const workspacesWithoutSubs = allWorkspaces.filter(
      (ws) => !activeWsIds.has(ws.id)
    );

    if (workspacesWithoutSubs.length === 0) {
      return NextResponse.json({
        created: 0,
        skipped: 0,
        errors: 0,
        message: 'No workspaces found without active subscriptions',
      });
    }

    // Process each workspace
    for (const workspace of workspacesWithoutSubs) {
      try {
        const isPersonal = workspace.personal;

        // Find the appropriate free product
        let productQuery = sbAdmin
          .from('workspace_subscription_products')
          .select('id, pricing_model, tier')
          .eq('pricing_model', isPersonal ? 'free' : 'seat_based');

        if (!isPersonal) {
          productQuery = productQuery.eq('tier', 'FREE');
        }

        const { data: products, error: productError } =
          await productQuery.limit(1);

        if (productError) {
          errors++;
          errorDetails.push({
            id: workspace.id,
            error: `Failed to find free product: ${productError.message}`,
          });
          continue;
        }

        const freeProduct = products?.[0];

        if (!freeProduct) {
          errors++;
          errorDetails.push({
            id: workspace.id,
            error: `No free product found for ${isPersonal ? 'personal' : 'non-personal'} workspace`,
          });
          continue;
        }

        // Check if subscription already exists for this product
        const { data: existingSub, error: checkError } = await sbAdmin
          .from('workspace_subscriptions')
          .select('id')
          .eq('ws_id', workspace.id)
          .eq('product_id', freeProduct.id)
          .maybeSingle();

        if (checkError) {
          errors++;
          errorDetails.push({
            id: workspace.id,
            error: `Failed to check existing subscription: ${checkError.message}`,
          });
          continue;
        }

        if (existingSub) {
          skipped++;
          continue;
        }

        // Create free subscription
        const { error: createError } = await sbAdmin
          .from('workspace_subscriptions')
          .insert({
            ws_id: workspace.id,
            product_id: freeProduct.id,
            status: 'active',
            current_period_start: new Date().toISOString(),
            polar_subscription_id: `migration_${uuid()}`,
          });

        if (createError) {
          errors++;
          errorDetails.push({
            id: workspace.id,
            error: `Failed to create subscription: ${createError.message}`,
          });
          continue;
        }

        created++;
      } catch (err) {
        errors++;
        errorDetails.push({
          id: workspace.id,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      created,
      skipped,
      errors,
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
      message: `Migration completed: ${created} subscriptions created, ${skipped} skipped, ${errors} errors`,
    });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Unknown migration error',
      },
      { status: 500 }
    );
  }
}
