import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { getSatelliteWorkspace } from '@tuturuuu/satellite/workspace-access';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
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

  const polar = createPolarClient();

  const checkout = await polar.checkouts.get({ id: checkoutId });

  if (!checkout) {
    return notFound();
  }

  const workspace = await getSatelliteWorkspace('pay', id);
  if (!workspace) return notFound();

  return <ClientComponent wsId={workspace.id} checkout={checkout} />;
}
