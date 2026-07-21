import { redirect } from 'next/navigation';

export default async function WorkspaceHomePage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  redirect(`/${wsId}/forms`);
}
