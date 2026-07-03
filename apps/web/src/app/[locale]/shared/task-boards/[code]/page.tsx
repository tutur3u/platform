import { redirect } from 'next/navigation';
import { getTasksAppOrigin } from '@/lib/tasks-app-url';

interface PageProps {
  params: Promise<{
    code: string;
    locale: string;
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
    } else if (Array.isArray(value)) {
      value.forEach((entry) => {
        url.searchParams.append(key, entry);
      });
    }
  }
}

export default async function PublicTaskBoardPage({
  params,
  searchParams,
}: PageProps) {
  const { code, locale } = await params;
  const url = new URL(
    `/${locale}/shared/task-boards/${encodeURIComponent(code)}`,
    getTasksAppOrigin()
  );
  appendSearchParams(url, await searchParams);

  redirect(url.toString());
}
