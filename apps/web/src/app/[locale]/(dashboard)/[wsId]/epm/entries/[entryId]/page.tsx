import { redirect } from 'next/navigation';
import { getCmsUrl } from '@/lib/cms-url';

interface Props {
  params: Promise<{
    entryId: string;
    wsId: string;
  }>;
}

export default async function EpmEntryLegacyPage({ params }: Props) {
  const { entryId, wsId } = await params;
  redirect(getCmsUrl(`/${wsId}/library/entries/${entryId}`));
}
