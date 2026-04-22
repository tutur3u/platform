import { Goal, Sparkles } from '@tuturuuu/icons';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { JSONContent } from '@tuturuuu/types/tiptap';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { resolveRouteWorkspace } from '@/lib/resolve-route-workspace';
import { ModuleContentEditor } from './content-editor';

export const metadata: Metadata = {
  title: 'Content',
  description: 'Manage Content in the Module area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
    courseId: string;
    moduleId: string;
  }>;
}

export default async function ModuleContentPage({ params }: Props) {
  const { wsId: routeWsId, courseId, moduleId } = await params;
  const { resolvedWsId } = await resolveRouteWorkspace(routeWsId);
  const t = await getTranslations();

  const getContent = async (courseId: string, moduleId: string) => {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('workspace_course_modules')
      .select('content')
      .eq('id', moduleId)
      .eq('group_id', courseId);

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
            <h1 className="flex w-full items-center gap-2 font-bold text-lg md:text-2xl">
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
        wsId={resolvedWsId}
        courseId={courseId}
        moduleId={moduleId}
        content={content}
      />
    </div>
  );
}
