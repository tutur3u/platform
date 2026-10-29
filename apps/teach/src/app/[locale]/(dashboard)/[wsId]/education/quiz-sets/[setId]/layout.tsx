import { Box, Eye, Paperclip } from '@tuturuuu/icons';
import LinkButton from '@tuturuuu/ui/custom/education/modules/link-button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { requireQuizSetPageAccess } from '@/lib/quiz-set-page-access';
import { getQuizSetSummary } from './data';

interface Props {
  children: ReactNode;
  params: Promise<{
    locale: string;
    wsId: string;
    setId: string;
  }>;
}

export default async function QuizSetDetailsLayout({
  children,
  params,
}: Props) {
  await connection();

  const t = await getTranslations();
  const { wsId, setId } = await params;
  const commonHref = `/${wsId}/education/quiz-sets/${setId}`;

  const { resolvedWsId } = await requireQuizSetPageAccess(wsId, setId);
  const {
    set: data,
    linkedQuizzes,
    linkedModules,
  } = await getQuizSetSummary(resolvedWsId, setId);

  return (
    <>
      <FeatureSummary
        title={
          <>
            <h1 className="flex w-full items-center gap-2 font-bold text-2xl">
              <div className="flex items-center gap-2 rounded-lg border border-dynamic-purple/20 bg-dynamic-purple/10 px-2 text-dynamic-purple text-lg max-md:hidden">
                <Box className="h-6 w-6" />
                {t('ws-quiz-sets.singular')}
              </div>
              <div className="line-clamp-1 font-bold text-lg md:text-2xl">
                {data.name || t('common.unknown')}
              </div>
            </h1>
            <Separator className="my-2" />
          </>
        }
        description={
          <div className="grid flex-wrap gap-2 md:flex">
            <LinkButton
              href={`${commonHref}`}
              title={`${t('ws-quizzes.plural')} (${linkedQuizzes || 0})`}
              icon={<Eye className="h-5 w-5" />}
              className="border-foreground/20 bg-foreground/10 text-foreground hover:bg-foreground/20"
            />
            <LinkButton
              href={`${commonHref}/linked-modules`}
              title={`${t('quiz-set-data-table.linked_modules')} (${linkedModules || 0})`}
              icon={<Paperclip className="h-5 w-5" />}
              className="border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple hover:bg-dynamic-purple/20"
            />
          </div>
        }
      />
      <Separator className="my-4" />
      {children}
    </>
  );
}
