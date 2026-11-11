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

const STANDALONE_TASK_SEGMENTS = new Set([
  'boards',
  'cycles',
  'drafts',
  'estimates',
  'goals',
  'habits',
  'import',
  'initiatives',
  'labels',
  'leaderboards',
  'logs',
  'notes',
  'progress',
  'projects',
  'stats',
  'templates',
]);

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

function buildTasksAppPath({
  locale,
  slug = [],
  wsId,
}: {
  locale: string;
  slug?: string[];
  wsId: string;
}) {
  if (slug.length === 0) {
    return `/${locale}/${wsId}/tasks`;
  }

  const [firstSegment, ...rest] = slug;

  if (firstSegment && STANDALONE_TASK_SEGMENTS.has(firstSegment)) {
    return `/${locale}/${wsId}/${[firstSegment, ...rest]
      .map(encodeURIComponent)
      .join('/')}`;
  }

  return `/${locale}/${wsId}/tasks/${slug.map(encodeURIComponent).join('/')}`;
}

export default async function TasksRedirectPage({
  params,
  searchParams,
}: PageProps) {
  const { locale, slug, wsId } = await params;
  const url = new URL(
    buildTasksAppPath({ locale, slug, wsId }),
    getTasksAppOrigin()
  );
  appendSearchParams(url, await searchParams);

  redirect(url.toString());
}
