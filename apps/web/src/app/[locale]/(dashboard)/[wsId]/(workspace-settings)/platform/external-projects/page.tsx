import { redirect } from 'next/navigation';
import { getCmsUrl } from '@/lib/cms-url';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function PlatformExternalProjectsLegacyPage({
  params,
}: Props) {
  await params;
  redirect(getCmsUrl('/internal/admin'));
}
