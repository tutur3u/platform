import { redirect } from 'next/navigation';

interface WorkforcePageProps {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkforcePage({ params }: WorkforcePageProps) {
  const { wsId } = await params;

  redirect(`/${wsId}/users/database`);
}
