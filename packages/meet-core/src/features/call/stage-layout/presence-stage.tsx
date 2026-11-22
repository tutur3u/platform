'use client';

import type { ComponentProps } from 'react';
import { ActivitiesMenu } from '../components/activities-menu';
import { CallPresenceRoster } from '../components/call-presence-roster';
import { DOCUMENT_ACTIVITY, PROGRAMMING_ACTIVITY } from './activity-ids';
import type { StageLayoutController } from './use-stage-layout';

/** The presence-only room's stage: who is here, and how to open shared work. */
export function PresenceStage({
  stage,
  canBrowse,
  tools,
  navigationAllowed,
  ...roster
}: {
  stage: Pick<StageLayoutController, 'open'>;
  canBrowse: boolean;
  tools: Pick<
    ComponentProps<typeof ActivitiesMenu>,
    'tools' | 'openToolIds' | 'onTool'
  >;
  navigationAllowed: boolean;
} & Pick<
  ComponentProps<typeof CallPresenceRoster>,
  'participants' | 'selfUserId' | 'raisedHandUserIds'
>) {
  return (
    <CallPresenceRoster
      {...roster}
      onProgramming={
        canBrowse ? () => stage.open(PROGRAMMING_ACTIVITY) : undefined
      }
      onDocument={canBrowse ? () => stage.open(DOCUMENT_ACTIVITY) : undefined}
      activities={
        tools.tools.length ? (
          <ActivitiesMenu {...tools} navigationAllowed={navigationAllowed} />
        ) : null
      }
    />
  );
}
