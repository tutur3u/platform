'use client';

import { LayoutGrid } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import { ActivitiesMenu } from '../components/activities-menu';
import { CallPresenceRoster } from '../components/call-presence-roster';
import { DOCUMENT_ACTIVITY, PROGRAMMING_ACTIVITY } from './activity-ids';
import { useActivitiesRequest } from './activities-request';
import type { StageLayoutController } from './use-stage-layout';

/** The presence-only room's stage: who is here, and how to open shared work. */
export function PresenceStage({
  stage,
  canBrowse,
  tools,
  navigationAllowed,
  openFromDock,
  ...roster
}: {
  stage: Pick<StageLayoutController, 'open'>;
  canBrowse: boolean;
  tools: Pick<
    ComponentProps<typeof ActivitiesMenu>,
    'tools' | 'openToolIds' | 'onTool'
  >;
  navigationAllowed: boolean;
  openFromDock?: boolean;
} & Pick<
  ComponentProps<typeof CallPresenceRoster>,
  'participants' | 'selfUserId' | 'raisedHandUserIds'
>) {
  const request = useActivitiesRequest();
  const t = useTranslations('meet.call.activities');

  return (
    <CallPresenceRoster
      {...roster}
      onProgramming={
        canBrowse ? () => stage.open(PROGRAMMING_ACTIVITY) : undefined
      }
      onDocument={canBrowse ? () => stage.open(DOCUMENT_ACTIVITY) : undefined}
      activities={
        openFromDock && request?.available ? (
          <Button type="button" variant="outline" onClick={request.request}>
            <LayoutGrid aria-hidden="true" className="size-4" />
            {t('button')}
          </Button>
        ) : !openFromDock && tools.tools.length ? (
          <ActivitiesMenu {...tools} navigationAllowed={navigationAllowed} />
        ) : null
      }
    />
  );
}
