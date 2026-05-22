import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function LegacySettingsAppCoordinationPage({
  params,
}: Props) {
  const { wsId } = await params;
  redirect(`/${wsId}/infrastructure/app-coordination`);
}
