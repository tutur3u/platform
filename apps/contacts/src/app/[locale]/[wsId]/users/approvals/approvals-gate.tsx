'use client';

import { Info, TriangleAlert } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import {
  WorkspaceFeatureForbiddenGate,
  WorkspaceFeatureNoticeGate,
  WorkspaceFeatureUnavailableGate,
} from '@/components/feature-gate/workspace-feature-gate';

/**
 * Approvals stays unavailable in personal workspaces by product decision — this
 * only replaces the inline banner with the shared gate layout so every Contacts
 * module explains itself the same way.
 */
export function ApprovalsPersonalGate() {
  const t = useTranslations('approvals');

  return (
    <WorkspaceFeatureNoticeGate
      description={t('personal.description')}
      icon={<Info className="h-7 w-7" />}
      title={t('personal.title')}
    />
  );
}

export function ApprovalsForbiddenGate() {
  const t = useTranslations('approvals');

  return (
    <WorkspaceFeatureForbiddenGate
      description={t('no_access_description')}
      title={t('no_access_title')}
    />
  );
}

export function ApprovalsUnavailableGate() {
  const t = useTranslations('approvals');

  return (
    <WorkspaceFeatureUnavailableGate
      description={t('unavailable_description')}
      icon={<TriangleAlert className="h-7 w-7" />}
      title={t('unavailable_title')}
    />
  );
}
