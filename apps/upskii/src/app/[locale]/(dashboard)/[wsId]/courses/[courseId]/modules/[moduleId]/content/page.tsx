import ModuleContentEditor from './content-editor';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Goal, Sparkles } from '@tuturuuu/ui/icons';
import { JSONContent } from '@tuturuuu/ui/tiptap';
import { getTranslations } from 'next-intl/server';

interface Props {
  params: Promise<{
    courseId: string;
    moduleId: string;
  }>;
}

export default async function ModuleContentPage({ params }: Props) {
  const { courseId, moduleId } = await params;
  const t = await getTranslations();

  const getContent = async (courseId: string, moduleId: string) => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('workspace_course_modules')
      .select('content')
      .eq('id', moduleId)
      .eq('course_id', courseId);

    if (error) {
      console.error(error);
    }

    return data?.[0]?.content as JSONContent;
  };

  const content = await getContent(courseId, moduleId);

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
      <ModuleContentEditor
        courseId={courseId}
        moduleId={moduleId}
        content={content}
      />
    </div>
  );
}
