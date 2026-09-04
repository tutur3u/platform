'use client';

import {
  CalendarClock,
  GraduationCap,
  LifeBuoy,
  Sparkles,
  TriangleAlert,
} from '@tuturuuu/icons';
import {
  ENABLE_TUTORING_CONFIG_ID,
  updateWorkspaceConfig,
} from '@tuturuuu/internal-api/workspace-configs';
import { useTranslations } from 'next-intl';
import {
  WorkspaceFeatureDisabledGate,
  WorkspaceFeatureForbiddenGate,
  WorkspaceFeatureUnavailableGate,
} from '@/components/feature-gate/workspace-feature-gate';

export function TutoringDisabledGate({
  canEnable,
  wsId,
}: {
  canEnable: boolean;
  wsId: string;
}) {
  const t = useTranslations('ws-tutoring');

  return (
    <WorkspaceFeatureDisabledGate
      canEnable={canEnable}
      description={t('feature_disabled_description')}
      enableLabel={t('enable_feature')}
      errorMessage={t('feature_enable_failed')}
      highlights={[
        {
          description: t('feature_highlight_queue_description'),
          icon: <LifeBuoy className="h-4 w-4 text-dynamic-purple" />,
          title: t('feature_highlight_queue'),
        },
        {
          description: t('feature_highlight_schedule_description'),
          icon: <CalendarClock className="h-4 w-4 text-dynamic-purple" />,
          title: t('feature_highlight_schedule'),
        },
        {
          description: t('feature_highlight_payroll_description'),
          icon: <Sparkles className="h-4 w-4 text-dynamic-purple" />,
          title: t('feature_highlight_payroll'),
        },
      ]}
      icon={<GraduationCap className="h-7 w-7" />}
      memberDescription={t('feature_disabled_description_member')}
      onEnable={() =>
        updateWorkspaceConfig(wsId, ENABLE_TUTORING_CONFIG_ID, 'true')
      }
      successMessage={t('feature_enabled')}
      title={t('feature_disabled_title')}
    />
  );
}

export function TutoringForbiddenGate() {
  const t = useTranslations('ws-tutoring');

  return (
    <WorkspaceFeatureForbiddenGate
      description={t('no_access_description')}
      title={t('no_access_title')}
    />
  );
}

export function TutoringUnavailableGate() {
  const t = useTranslations('ws-tutoring');

  return (
    <WorkspaceFeatureUnavailableGate
      description={t('unavailable_description')}
      icon={<TriangleAlert className="h-7 w-7" />}
      title={t('unavailable_title')}
    />
  );
}
