import {
  createPolarClient,
  ResourceNotFound,
} from '@tuturuuu/payment/polar/server';
import { checkManageSubscriptionPermission } from '@tuturuuu/payment-core/billing-helper';
import { resolveSatellitePageActor } from '@tuturuuu/satellite/workspace-access';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import ClientComponent from './client-component';

export const metadata: Metadata = {
  title: 'Success',
  description: 'Manage Success in the Billing area of your Tuturuuu workspace.',
};

export default async function SuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  await connection();
  const { checkoutId } = await searchParams;
  const { wsId: id } = await params;

  if (!checkoutId) {
    return notFound();
  }

  const actor = await resolveSatellitePageActor(['pay', 'platform']);
  if (!actor) return notFound();
  const workspace = await getWorkspace(id, {
    useAdmin: true,
    user: actor.user,
  });
  if (
    !workspace ||
    !(await checkManageSubscriptionPermission(
      actor.admin,
      workspace.id,
      actor.user.id
    ))
  ) {
    return notFound();
  }

  const polar = createPolarClient();

  const checkout = await polar.checkouts
    .get({ id: checkoutId })
    .catch((error: unknown) => {
      if (error instanceof ResourceNotFound) return notFound();
      throw error;
    });

  if (!checkout || checkout.metadata.wsId !== workspace.id) {
    return notFound();
  }

  if (checkout.status !== 'succeeded') {
    return redirect(`/${workspace.id}/billing#billing-history`);
  }

  return <ClientComponent wsId={workspace.id} checkout={checkout} />;
}
