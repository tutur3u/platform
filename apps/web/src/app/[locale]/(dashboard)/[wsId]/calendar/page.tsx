import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCalendarAppOrigin } from '@/lib/calendar-app-url';

export const metadata: Metadata = {
  title: 'Calendar',
  description: 'Manage Calendar in your Tuturuuu workspace.',
};

interface PageProps {
  params: Promise<{
    wsId: string;
    locale: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function appendSearchParams(
  url: URL,
  searchParams: Record<string, string | string[] | undefined>
) {
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined) url.searchParams.append(key, item);
      }
      continue;
    }

    if (value !== undefined) url.searchParams.set(key, value);
  }
}

export default async function CalendarPage({
  params,
  searchParams,
}: PageProps) {
  const { wsId } = await params;
  const query = await searchParams;
  const calendarUrl = new URL(
    `/${encodeURIComponent(wsId)}`,
    getCalendarAppOrigin()
  );
  appendSearchParams(calendarUrl, query);

  redirect(calendarUrl.toString());
}
