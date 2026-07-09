import { createPolarClient } from '@tuturuuu/payment/polar/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
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
  const { checkoutId } = await searchParams;

  if (!checkoutId) {
    return notFound();
  }

  const polar = createPolarClient();

  const checkout = await polar.checkouts.get({ id: checkoutId });

  if (!checkout) {
    return notFound();
  }

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        return <ClientComponent wsId={wsId} checkout={checkout} />;
      }}
    </WorkspaceWrapper>
  );
}
