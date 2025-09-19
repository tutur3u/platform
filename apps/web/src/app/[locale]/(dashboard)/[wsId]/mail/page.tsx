import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

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
  redirect(`/${wsId}/mail/sent`);
}
