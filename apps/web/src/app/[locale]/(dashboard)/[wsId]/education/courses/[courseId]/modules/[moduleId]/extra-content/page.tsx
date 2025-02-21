import { ModuleExtraContentEditor } from './editor';
import { Button } from '@tutur3u/ui/button';
import FeatureSummary from '@tutur3u/ui/custom/feature-summary';
import { BookText, Sparkles } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

interface Props {
  params: Promise<{
    wsId: string;
    courseId: string;
    moduleId: string;
  }>;
}

export default async function ModuleExtraContentPage({ params }: Props) {
  const { courseId, moduleId } = await params;
  const t = await getTranslations();

  return (
    <div className="grid gap-4">
      <FeatureSummary
        title={
          <div className="flex items-center justify-between gap-4">
            <h1 className="flex w-full items-center gap-2 text-lg font-bold md:text-2xl">
              <BookText className="h-5 w-5" />
              {t('course-details-tabs.extra_reading')}
            </h1>
          </div>
        }
        secondaryTrigger={
          <Button size="xs" variant="ghost" disabled>
            <Sparkles />
            {t('common.generate_with_ai')}
          </Button>
        }
        showSecondaryTrigger
      />
      <ModuleExtraContentEditor courseId={courseId} moduleId={moduleId} />
    </div>
  );
}
