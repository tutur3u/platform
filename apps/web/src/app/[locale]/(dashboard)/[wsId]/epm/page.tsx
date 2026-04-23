import { redirect } from 'next/navigation';
import { getCmsUrl } from '@/lib/cms-url';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function EpmLegacyPage({ params }: Props) {
  const { wsId } = await params;
  redirect(getCmsUrl(`/${wsId}/library`));
}
