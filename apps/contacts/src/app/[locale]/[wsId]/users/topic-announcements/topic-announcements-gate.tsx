'use client';

import { Megaphone, Send, TriangleAlert, UserCheck } from '@tuturuuu/icons';
import { updateWorkspaceFeatureSecret } from '@tuturuuu/internal-api/workspace-configs';
import { TOPIC_ANNOUNCEMENTS_SECRET } from '@tuturuuu/utils/topic-announcements';
import { useTranslations } from 'next-intl';
import {
  WorkspaceFeatureDisabledGate,
  WorkspaceFeatureForbiddenGate,
  WorkspaceFeatureUnavailableGate,
} from '@/components/feature-gate/workspace-feature-gate';

export function TopicAnnouncementsDisabledGate({
  canEnable,
  wsId,
}: {
  canEnable: boolean;
  wsId: string;
}) {
  const t = useTranslations('ws-topic-announcements-gate');

  return (
    <WorkspaceFeatureDisabledGate
      canEnable={canEnable}
      description={t('disabled_description')}
      enableLabel={t('enable_feature')}
      errorMessage={t('enable_failed')}
      highlights={[
        {
          description: t('highlight_contacts_description'),
          icon: <UserCheck className="h-4 w-4 text-dynamic-purple" />,
          title: t('highlight_contacts'),
        },
        {
          description: t('highlight_templates_description'),
          icon: <Megaphone className="h-4 w-4 text-dynamic-purple" />,
          title: t('highlight_templates'),
        },
        {
          description: t('highlight_delivery_description'),
          icon: <Send className="h-4 w-4 text-dynamic-purple" />,
          title: t('highlight_delivery'),
        },
      ]}
      icon={<Megaphone className="h-7 w-7" />}
      memberDescription={t('disabled_description_member')}
      onEnable={() =>
        updateWorkspaceFeatureSecret(wsId, TOPIC_ANNOUNCEMENTS_SECRET, true)
      }
      successMessage={t('enabled')}
      title={t('disabled_title')}
    />
  );
}

export function TopicAnnouncementsForbiddenGate() {
  const t = useTranslations('ws-topic-announcements-gate');

  return (
    <WorkspaceFeatureForbiddenGate
      description={t('no_access_description')}
      title={t('no_access_title')}
    />
  );
}

export function TopicAnnouncementsUnavailableGate() {
  const t = useTranslations('ws-topic-announcements-gate');

  return (
    <WorkspaceFeatureUnavailableGate
      description={t('unavailable_description')}
      icon={<TriangleAlert className="h-7 w-7" />}
      title={t('unavailable_title')}
    />
  );
}
