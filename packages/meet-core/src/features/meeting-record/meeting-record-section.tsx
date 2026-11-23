'use client';

import { meetPublicUrl } from '@tuturuuu/utils/meet-url';
import { TASKS_URL } from '../../constants/common';
import { MeetingProjects } from './meeting-projects';
import { MeetingRecordPanel } from './meeting-record-panel';

/**
 * The meeting record for a meeting page, with its Projects when the page has
 * no title row to show them in (an ended meeting).
 */
export function MeetingRecordSection({
  wsId,
  meetingId,
  workspaceSlug,
  withProjects = false,
}: {
  wsId: string;
  meetingId: string;
  workspaceSlug: string;
  withProjects?: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-3">
      {withProjects ? (
        <MeetingProjects meetingId={meetingId} wsId={wsId} />
      ) : null}
      <MeetingRecordPanel
        meetingId={meetingId}
        sourceUrl={meetPublicUrl(
          `/${encodeURIComponent(wsId)}/meetings/${encodeURIComponent(meetingId)}`
        )}
        tasksUrl={TASKS_URL}
        workspaceSlug={workspaceSlug}
        wsId={wsId}
      />
    </div>
  );
}
