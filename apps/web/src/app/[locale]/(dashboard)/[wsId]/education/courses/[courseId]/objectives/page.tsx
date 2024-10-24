import { CourseSection } from '../section';
import { ModuleObjectivesEditor } from './editor';
import { Goal } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

interface Props {
  params: Promise<{
    wsId: string;
    courseId: string;
  }>;
}

export default async function ModuleObjectsPage({ params }: Props) {
  const { wsId, courseId } = await params;
  const t = await getTranslations();

  return (
    <div className="grid gap-4">
      <CourseSection
        title={t('course-details-tabs.module_objectives')}
        icon={<Goal className="h-5 w-5" />}
        hideContent
      />
      <ModuleObjectivesEditor wsId={wsId} courseId={courseId} />
    </div>
  );
}
