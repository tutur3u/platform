import { isInventoryEnabled } from '@tuturuuu/inventory-core/access';
import { getPublicStorefront } from '@tuturuuu/inventory-core/commerce/public-storefront';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getWorkspaceConfig } from '@tuturuuu/utils/workspace-helper';
import { connection, NextResponse } from 'next/server';
import { authorizeSquareCheckoutStaff } from '@/lib/square-checkout-access';

interface Params {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, { params }: Params) {
  await connection();

  try {
    const { slug } = await params;
    const payload = await getPublicStorefront(slug);
    if (!payload || !(await isInventoryEnabled(payload.storefront.wsId))) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    const authorization = await authorizeSquareCheckoutStaff(
      request,
      payload.storefront.wsId
    );
    if (!authorization.ok) return authorization.response;

    const configuredCheckoutMode = payload.storefront.checkoutMode;
    const paymentMethods: Array<'cash' | 'configured'> =
      configuredCheckoutMode === 'cash'
        ? ['cash']
        : configuredCheckoutMode === 'polar' ||
            configuredCheckoutMode === 'square_pos' ||
            configuredCheckoutMode === 'square_terminal'
          ? ['configured', 'cash']
          : [];

    const sbAdmin = await createAdminClient();
    const [
      walletsResult,
      categoriesResult,
      defaultWalletId,
      defaultCategoryId,
    ] = await Promise.all([
      sbAdmin
        .schema('private')
        .from('workspace_wallets')
        .select('id, name')
        .eq('ws_id', payload.storefront.wsId)
        .eq('currency', payload.storefront.currency.toUpperCase())
        .order('name'),
      sbAdmin
        .from('transaction_categories')
        .select('id, name')
        .eq('ws_id', payload.storefront.wsId)
        .order('name'),
      getWorkspaceConfig(
        payload.storefront.wsId,
        'inventory_default_revenue_wallet_id'
      ),
      getWorkspaceConfig(
        payload.storefront.wsId,
        'inventory_default_finance_category_id'
      ),
    ]);

    if (walletsResult.error) throw walletsResult.error;
    if (categoriesResult.error) throw categoriesResult.error;
    const wallets = walletsResult.data ?? [];
    const categories = categoriesResult.data ?? [];

    return NextResponse.json({
      cash: paymentMethods.includes('cash')
        ? {
            categories,
            defaultCategoryId: categories.some(
              (category) => category.id === defaultCategoryId
            )
              ? defaultCategoryId
              : null,
            defaultWalletId: wallets.some(
              (wallet) => wallet.id === defaultWalletId
            )
              ? defaultWalletId
              : null,
            wallets,
          }
        : null,
      configuredCheckoutMode,
      paymentMethods,
      staffAuthorized: true,
    });
  } catch (error) {
    console.error('Failed to load staff checkout options', error);
    return NextResponse.json(
      { message: 'Unable to load staff checkout options.' },
      { status: 500 }
    );
  }
}
