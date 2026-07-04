import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import {
  type BillingSuccessCheckout,
  BillingSuccessPage,
} from '../../../../components/billing/billing-success-page';
import { requireCurrentUser } from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';
import { resolveWorkspace } from '../../../../lib/platform/workspace';

type BillingSuccessSearch = {
  checkoutId?: string;
};

type BillingSuccessLoaderData = {
  checkout: BillingSuccessCheckout;
  workspaceId: string;
};

const loadPolarCheckout = createServerFn({ method: 'GET' })
  .validator((data: { checkoutId: string }) => data)
  .handler(async ({ data }): Promise<BillingSuccessCheckout | null> => {
    const { createPolarClient } = await import(
      '@tuturuuu/payment/polar/server'
    );
    const checkout = await createPolarClient().checkouts.get({
      id: data.checkoutId,
    });

    if (!checkout?.id) {
      return null;
    }

    return {
      amount: checkout.amount,
      createdAt: new Date(checkout.createdAt).toISOString(),
      id: checkout.id,
      productName: checkout.product?.name ?? 'Unknown Plan',
    };
  });

export const Route = createFileRoute('/$locale/$wsId/billing/success')({
  component: BillingSuccessRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage Success in the Billing area of your Tuturuuu workspace.',
      locale,
      title: 'Success',
    });
  },
  validateSearch: (search: Record<string, unknown>): BillingSuccessSearch => ({
    checkoutId:
      typeof search.checkoutId === 'string' ? search.checkoutId : undefined,
  }),
  loaderDeps: ({ search }) => {
    const { checkoutId } = search as BillingSuccessSearch;

    return { checkoutId };
  },
  loader: async ({ deps, params }): Promise<BillingSuccessLoaderData> => {
    const { checkoutId: checkoutIdParam } = deps as BillingSuccessSearch;
    const checkoutId =
      typeof checkoutIdParam === 'string' ? checkoutIdParam.trim() : '';

    if (!checkoutId) {
      throw notFound();
    }

    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/billing/success?checkoutId=${encodeURIComponent(
        checkoutId
      )}`,
    });

    const workspace = await resolveWorkspace({
      data: { wsId: params.wsId },
    });
    if (!workspace.exists) {
      throw notFound();
    }

    const checkout = await loadPolarCheckout({ data: { checkoutId } });
    if (!checkout) {
      throw notFound();
    }

    return {
      checkout,
      workspaceId: workspace.workspaceId,
    };
  },
});

function BillingSuccessRoutePage() {
  const { checkout, workspaceId } =
    Route.useLoaderData() as BillingSuccessLoaderData;
  const { locale } = Route.useParams();

  return (
    <BillingSuccessPage
      checkout={checkout}
      locale={locale}
      wsId={workspaceId}
    />
  );
}
