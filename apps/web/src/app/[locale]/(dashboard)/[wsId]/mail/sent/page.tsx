import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getMailAppOrigin } from '@/lib/mail-app-url';

export const metadata: Metadata = {
  title: 'Sent',
  description: 'Manage Sent in the Mail area of your Tuturuuu workspace.',
};

export default async function MailSentPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  redirect(`${getMailAppOrigin()}/${wsId}?folder=sent`);
}
