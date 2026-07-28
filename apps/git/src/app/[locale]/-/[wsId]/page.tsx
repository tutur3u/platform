import { redirect } from 'next/navigation';

export default async function GitAdminIndex({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  redirect(`/-/${wsId}/repositories`);
}
