import { TailwindAdvancedEditor } from '../../../../documents/advanced-editor';
import CourseSection from '../section';
import { Goal } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

export default async function ModuleObjectsPage() {
  const t = await getTranslations();

  return (
    <div className="grid gap-4">
      <CourseSection
        title={t('course-details-tabs.module_objectives')}
        icon={<Goal className="h-5 w-5" />}
        hideContent
      />
      <TailwindAdvancedEditor />
    </div>
  );
}
