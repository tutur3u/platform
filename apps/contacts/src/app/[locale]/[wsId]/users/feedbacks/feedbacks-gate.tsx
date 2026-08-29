'use client';

import {
  MessageCircle,
  ThumbsUp,
  TriangleAlert,
  UserRoundSearch,
} from '@tuturuuu/icons';
import {
  ENABLE_FEEDBACKS_CONFIG_ID,
  updateWorkspaceConfig,
} from '@tuturuuu/internal-api/workspace-configs';
import { useTranslations } from 'next-intl';
import {
  WorkspaceFeatureDisabledGate,
  WorkspaceFeatureForbiddenGate,
  WorkspaceFeatureUnavailableGate,
} from '@/components/feature-gate/workspace-feature-gate';

export function FeedbacksDisabledGate({
  canEnable,
  wsId,
}: {
  canEnable: boolean;
  wsId: string;
}) {
  const t = useTranslations('ws-feedbacks-gate');

  return (
    <WorkspaceFeatureDisabledGate
      canEnable={canEnable}
      description={t('disabled_description')}
      enableLabel={t('enable_feature')}
      errorMessage={t('enable_failed')}
      highlights={[
        {
          description: t('highlight_capture_description'),
          icon: <MessageCircle className="h-4 w-4 text-dynamic-purple" />,
          title: t('highlight_capture'),
        },
        {
          description: t('highlight_attention_description'),
          icon: <UserRoundSearch className="h-4 w-4 text-dynamic-purple" />,
          title: t('highlight_attention'),
        },
        {
          description: t('highlight_followup_description'),
          icon: <ThumbsUp className="h-4 w-4 text-dynamic-purple" />,
          title: t('highlight_followup'),
        },
      ]}
      icon={<MessageCircle className="h-7 w-7" />}
      memberDescription={t('disabled_description_member')}
      onEnable={() =>
        updateWorkspaceConfig(wsId, ENABLE_FEEDBACKS_CONFIG_ID, 'true')
      }
      successMessage={t('enabled')}
      title={t('disabled_title')}
    />
  );
}

export function FeedbacksForbiddenGate() {
  const t = useTranslations('ws-feedbacks-gate');

  return (
    <WorkspaceFeatureForbiddenGate
      description={t('no_access_description')}
      title={t('no_access_title')}
    />
  );
}

export function FeedbacksUnavailableGate() {
  const t = useTranslations('ws-feedbacks-gate');

  return (
    <WorkspaceFeatureUnavailableGate
      description={t('unavailable_description')}
      icon={<TriangleAlert className="h-7 w-7" />}
      title={t('unavailable_title')}
    />
  );
}
