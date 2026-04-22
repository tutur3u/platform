import { redirect } from 'next/navigation';
import { getCmsUrl } from '@/lib/cms-url';

interface Props {
  params: Promise<{
    collectionId: string;
    wsId: string;
  }>;
}

export default async function EpmCollectionLegacyPage({ params }: Props) {
  const { collectionId, wsId } = await params;
  redirect(getCmsUrl(`/${wsId}/collections/${collectionId}`));
}
