import { redirect } from 'next/navigation';
import { getMindAppOrigin } from '@/lib/mind-app-url';

interface PageProps {
  params: Promise<{ wsId: string }>;
}

// The mind experience has moved to the dedicated mind app (apps/mind), which
// serves each workspace's mind boards at its root path. This route redirects
// there to preserve existing links.
export default async function MindRedirectPage({ params }: PageProps) {
  const { wsId } = await params;
  redirect(`${getMindAppOrigin()}/${wsId}`);
}
