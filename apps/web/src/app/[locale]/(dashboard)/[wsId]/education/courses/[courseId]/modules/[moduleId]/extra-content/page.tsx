import { CourseSection } from '../../../section';
import { ModuleExtraContentEditor } from './editor';
import { BookText } from 'lucide-react';
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
      <CourseSection
        title={t('course-details-tabs.extra_reading')}
        icon={<BookText className="h-5 w-5" />}
        hideContent
      />
      <ModuleExtraContentEditor courseId={courseId} moduleId={moduleId} />
    </div>
  );
}
