import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { loadPublicTaskBoard } from '@/lib/tasks/public-task-board';
import PublicTaskBoardContent from './content';

interface PageProps {
  params: Promise<{ code: string; locale: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { code } = await params;
  const t = await getTranslations('ws-task-boards.public');
  const result = await loadPublicTaskBoard(code);

  if (result.status === 404) {
    return {
      title: t('unavailable_title'),
      description: t('unavailable_description'),
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  return {
    title: result.data.board.name || t('untitled_board'),
    description: t('metadata_description'),
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function PublicTaskBoardPage({ params }: PageProps) {
  const { code } = await params;
  const t = await getTranslations('ws-task-boards.public');
  const result = await loadPublicTaskBoard(code);

  if (result.status === 404) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-lg space-y-3 text-center">
          <h1 className="font-semibold text-3xl">{t('unavailable_title')}</h1>
          <p className="text-muted-foreground">
            {t('unavailable_description')}
          </p>
        </div>
      </main>
    );
  }

  return <PublicTaskBoardContent payload={result.data} />;
}
