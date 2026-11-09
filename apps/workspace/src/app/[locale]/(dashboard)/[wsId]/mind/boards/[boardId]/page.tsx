import { redirect } from 'next/navigation';
import { getMindAppOrigin } from '@/lib/mind-app-url';

interface PageProps {
  params: Promise<{ wsId: string; boardId: string }>;
}

// Mind boards moved to the dedicated mind app (apps/mind). Redirect deep links
// to preserve existing board URLs.
export default async function MindBoardRedirectPage({ params }: PageProps) {
  const { wsId, boardId } = await params;
  redirect(`${getMindAppOrigin()}/${wsId}/boards/${boardId}`);
}
