'use client';

import { useQuery } from '@tanstack/react-query';
import { WorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';
import { useTranslations } from 'next-intl';

export default function LocalWorkspaceSelect() {
  const t = useTranslations();
  return <WorkspaceSelect t={t} localUseQuery={useQuery} />;
}
