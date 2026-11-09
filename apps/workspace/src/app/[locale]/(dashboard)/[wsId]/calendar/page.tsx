import { redirect } from 'next/navigation';
import { getCalendarAppOrigin } from '@/lib/calendar-app-url';

interface PageProps {
  params: Promise<{ wsId: string }>;
}

// The calendar experience has moved to the dedicated calendar app
// (apps/calendar), which serves each workspace's calendar at its root path.
// This route now redirects there to preserve existing links.
export default async function CalendarRedirectPage({ params }: PageProps) {
  const { wsId } = await params;
  redirect(`${getCalendarAppOrigin()}/${wsId}`);
}
