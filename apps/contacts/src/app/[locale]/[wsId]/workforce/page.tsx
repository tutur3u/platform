import { redirect } from 'next/navigation';

interface WorkforcePageProps {
  params: Promise<{
    wsId: string;
  }>;
}

// Legacy workforce entry point — redirect into the migrated users database.
export default async function WorkforcePage({ params }: WorkforcePageProps) {
  const { wsId } = await params;

  redirect(`/${wsId}/users/database`);
}
