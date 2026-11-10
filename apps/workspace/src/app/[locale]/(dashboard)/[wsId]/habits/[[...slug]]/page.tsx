import { redirect } from 'next/navigation';
import { getTasksAppOrigin } from '@/lib/tasks-app-url';

interface PageProps {
  params: Promise<{
    locale: string;
    wsId: string;
    slug?: string[];
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function appendSearchParams(
  url: URL,
  searchParams: Record<string, string | string[] | undefined>
) {
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') {
      url.searchParams.append(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        url.searchParams.append(key, entry);
      }
    }
  }
}

export default async function HabitsRedirectPage({
  params,
  searchParams,
}: PageProps) {
  const { locale, slug = [], wsId } = await params;
  const url = new URL(
    `/${locale}/${wsId}/habits/${slug.map(encodeURIComponent).join('/')}`,
    getTasksAppOrigin()
  );
  appendSearchParams(url, await searchParams);

  redirect(url.toString());
}
