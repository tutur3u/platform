import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getMailAppOrigin } from '@/lib/mail-app-url';

export const metadata: Metadata = {
  title: 'Mail',
  description: 'Manage Mail in your Tuturuuu workspace.',
};

export default async function MailPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  redirect(`${getMailAppOrigin()}/${wsId}`);
}
