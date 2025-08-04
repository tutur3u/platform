import { redirect } from 'next/navigation';

export default async function MailPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  redirect(`/${wsId}/mail/sent`);
}
