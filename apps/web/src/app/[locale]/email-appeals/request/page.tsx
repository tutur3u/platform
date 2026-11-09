import type { Metadata } from 'next';
import { connection } from 'next/server';
import EmailAppealRecipientRequest from './recipient-request';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function EmailAppealRecipientRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ appeal?: string | string[] }>;
}) {
  await connection();
  const { appeal } = await searchParams;
  return (
    <EmailAppealRecipientRequest
      appealId={typeof appeal === 'string' ? appeal : ''}
    />
  );
}
