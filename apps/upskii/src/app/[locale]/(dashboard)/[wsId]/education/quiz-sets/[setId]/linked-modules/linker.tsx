'use client';

import { Filter } from '../../../../../users/filters';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceCourseModule } from '@tuturuuu/types/db';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

export function QuizsetModuleLinker({
  setId,
  data,
}: {
  setId: string;
  data: (Partial<WorkspaceCourseModule> & {
    selected?: boolean;
  })[];
}) {
  const router = useRouter();
  const t = useTranslations();
  const supabase = createClient();

  const onSet = async (moduleIds: string[]) => {
    await supabase.from('course_module_quiz_sets').upsert(
      moduleIds.map((module_id) => ({
        module_id,
        set_id: setId,
      }))
    );
    router.refresh();
  };

  return (
    <Filter
      title={t('ws-quiz-sets.link-modules')}
      options={data.map((module) => ({
        label: module.name!,
        value: module.id!,
        checked: module.selected,
        disabled: module.selected,
      }))}
      onSet={onSet}
      hideSelected
    />
  );
}
