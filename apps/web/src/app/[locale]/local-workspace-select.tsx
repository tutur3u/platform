'use client';

import { WorkspaceSelect } from '@ncthub/ui/custom/workspace-select';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

export default function LocalWorkspaceSelect() {
  const t = useTranslations();
  return <WorkspaceSelect t={t} localUseQuery={useQuery} />;
}
