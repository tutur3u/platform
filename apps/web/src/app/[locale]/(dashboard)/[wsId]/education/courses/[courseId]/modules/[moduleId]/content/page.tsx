import { CourseSection } from '../../../section';
import { ModuleContentEditor } from './editor';
import { Goal } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

interface Props {
  params: Promise<{
    wsId: string;
    courseId: string;
    moduleId: string;
  }>;
}

export default async function ModuleContentPage({ params }: Props) {
  const { courseId, moduleId } = await params;
  const t = await getTranslations();

  return (
    <div className="grid gap-4">
      <CourseSection
        title={t('course-details-tabs.module_content')}
        icon={<Goal className="h-5 w-5" />}
        hideContent
      />
      <ModuleContentEditor courseId={courseId} moduleId={moduleId} />
    </div>
  );
}
