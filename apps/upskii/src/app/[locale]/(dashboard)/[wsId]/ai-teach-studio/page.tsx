import PageContent from '@/app/[locale]/(dashboard)/[wsId]/ai-teach-studio/content';
import { cookies } from 'next/headers';

export default async function ToolsPage({
  params,
}: {
  params: Promise<{
    wsId: string;
  }>;
}) {
  const { wsId } = await params;
  const cookieStore = await cookies();
  const apiKey = cookieStore.get('google_api_key')?.value;
  return <PageContent apiKey={apiKey} wsId={wsId} />;
}
