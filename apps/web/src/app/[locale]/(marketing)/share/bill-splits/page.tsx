import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { getClientMessages } from '@/i18n/client-messages';
import { billSplitStatusOrigin } from '@/lib/finance/bill-splits/status-link';
import { BillSplitStatusClient } from './status-client';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function SharedBillSplitStatusPage() {
  await connection();
  if (!billSplitStatusOrigin()) notFound();
  const messages = getClientMessages(await getMessages(), [
    'bill-splits.settlement',
    'bill-splits.settled',
    'bill-splits.outstanding',
    'bill-splits.remaining-to-pay',
    'bill-splits.remaining-to-receive',
    'bill-splits.status-unavailable',
    'bill-splits.working',
    'bill-splits.check-settlement',
    'bill-splits.receiving-qr',
  ]);
  return (
    <NextIntlClientProvider messages={messages}>
      <BillSplitStatusClient />
    </NextIntlClientProvider>
  );
}
