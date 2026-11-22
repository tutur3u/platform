'use client';

import { CheckSquare } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { ActivityNotice, useActivity } from '../activity-kit';
import type { MeetToolPanelProps } from '../meet-tool';
import { LiveActivityPanelFrame } from '../panel-frame';
import { AssessmentBuilder } from './assessment-builder';
import { draftItems } from './assessment-draft';
import { AssessmentHost } from './assessment-host';
import { AssessmentParticipant } from './assessment-participant';

/**
 * A room-shared check for understanding. Hosts and co-hosts write the
 * questions, open them, read and grade answers and release results; everyone
 * else answers and later sees only their own result.
 */
export function AssessmentPanel({ onClose }: MeetToolPanelProps) {
  const activity = useActivity();
  const t = useTranslations('meet.call.live_activities.assessment');
  const { assessment } = activity.snapshot;
  const answers = activity.host?.assessment.answers ?? {};
  const saved = draftItems(assessment.items, answers);
  return (
    <LiveActivityPanelFrame
      title={t('title')}
      icon={CheckSquare}
      subtitle={t(`status_${assessment.status}`)}
      onClose={onClose}
    >
      {!activity.canManage ? (
        <AssessmentParticipant activity={activity} />
      ) : assessment.status === 'draft' ? (
        <AssessmentBuilder
          saved={saved}
          attemptId={assessment.attemptId}
          send={activity.send}
        />
      ) : (
        <AssessmentHost activity={activity} />
      )}
      <ActivityNotice error={activity.error} stale={activity.stale} />
    </LiveActivityPanelFrame>
  );
}
