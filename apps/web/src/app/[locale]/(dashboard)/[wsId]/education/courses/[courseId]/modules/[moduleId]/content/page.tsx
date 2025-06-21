import { Button } from '@ncthub/ui/button';
import FeatureSummary from '@ncthub/ui/custom/feature-summary';
import { Goal, Sparkles } from '@ncthub/ui/icons';
import { getTranslations } from 'next-intl/server';

// interface Props {
//   params: Promise<{
//     wsId: string;
//     courseId: string;
//     moduleId: string;
//   }>;
// }

export default async function ModuleContentPage() {
  const t = await getTranslations();

  return (
    <div className="grid gap-4">
      <FeatureSummary
        title={
          <div className="flex items-center justify-between gap-4">
            <h1 className="flex w-full items-center gap-2 text-lg font-bold md:text-2xl">
              <Goal className="h-5 w-5" />
              {t('course-details-tabs.module_content')}
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
      {/* <ModuleContentEditor courseId={courseId} moduleId={moduleId} /> */}
    </div>
  );
}
