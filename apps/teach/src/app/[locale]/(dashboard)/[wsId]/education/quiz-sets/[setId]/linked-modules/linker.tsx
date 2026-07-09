'use client';

import { linkQuizSetModules } from '@tuturuuu/internal-api/education';
import type { WorkspaceCourseModule } from '@tuturuuu/types';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Filter } from '../../../../users/filters';

export function QuizsetModuleLinker({
  wsId,
  setId,
  data,
}: {
  wsId: string;
  setId: string;
  data: (Partial<WorkspaceCourseModule> & {
    selected?: boolean;
  })[];
}) {
  const router = useRouter();
  const t = useTranslations();

  const onSet = async (moduleIds: string[]) => {
    await linkQuizSetModules(wsId, setId, moduleIds);
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
