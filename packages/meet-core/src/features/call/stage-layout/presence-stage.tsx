'use client';

import {
  CodeXml,
  FileText,
  LayoutGrid,
  PenTool,
  Presentation,
  Timer,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { ComponentProps, ComponentType } from 'react';
import { ActivitiesMenu } from '../components/activities-menu';
import { CallPresenceRoster } from '../components/call-presence-roster';
import { useMeetCallUx } from '../prejoin/use-meet-call-ux';
import { findMeetTool } from '../tools/registry';
import {
  BOARD_ACTIVITY,
  CLASSROOM_ACTIVITIES,
  DOCUMENT_ACTIVITY,
  PROGRAMMING_ACTIVITY,
  toolActivityId,
  toolIdOf,
} from './activity-ids';
import type { ActivityPresencePerson } from './activity-presence';
import { useActivitiesRequest } from './activities-request';
import { mergedKindOf } from './merged-activities';
import {
  PresenceLiveActivities,
  type PresenceLiveActivity,
} from './presence-live-activities';
import type { StageLayoutController } from './use-stage-layout';

/** The presence-only room's stage: live activities, who is here, and shortcuts. */
export function PresenceStage({
  stage,
  canBrowse,
  tools,
  navigationAllowed,
  openFromDock,
  presenceByActivity,
  defaultActivity,
  isAvailable,
  onOpenActivity,
  ...roster
}: {
  stage: Pick<StageLayoutController, 'open'> & {
    openIds?: readonly string[];
  };
  canBrowse: boolean;
  tools: Pick<
    ComponentProps<typeof ActivitiesMenu>,
    'tools' | 'openToolIds' | 'onTool'
  >;
  navigationAllowed: boolean;
  openFromDock?: boolean;
  presenceByActivity?: Record<string, readonly ActivityPresencePerson[]>;
  /** Host-enabled default activity (`tool:<id>`), if any. */
  defaultActivity?: string | null;
  /** Optional stage availability check (from `useStageAvailability`). */
  isAvailable?: (activityId: string) => boolean;
  /** Optional opener (e.g. `revealActivity` when presentation is minimized). */
  onOpenActivity?: (activityId: string) => void;
} & Pick<
  ComponentProps<typeof CallPresenceRoster>,
  'participants' | 'selfUserId' | 'raisedHandUserIds'
>) {
  const request = useActivitiesRequest();
  const all = useTranslations();
  const t = useTranslations('meet.call.activities');
  const classroomT = useTranslations('meet.classroom_tools');
  const programmingT = useTranslations('programmingPlayground');
  const collaborationT = useTranslations('meet.collaboration');
  const merged = useMeetCallUx();

  const describe = (id: string) =>
    t.has(`descriptions.${id}`) ? t(`descriptions.${id}`) : undefined;

  const resolveMeta = (
    activityId: string
  ): {
    title: string;
    description?: string;
    icon: ComponentType<{ className?: string }>;
  } | null => {
    if (activityId === PROGRAMMING_ACTIVITY)
      return {
        title: programmingT('coding'),
        description: describe('programming'),
        icon: CodeXml,
      };
    if (activityId === DOCUMENT_ACTIVITY)
      return {
        title: collaborationT('document'),
        description: describe('document'),
        icon: FileText,
      };
    if (activityId === BOARD_ACTIVITY)
      return merged
        ? {
            title: t('merged.whiteboard'),
            description: t('merged.whiteboard_description'),
            icon: PenTool,
          }
        : {
            title: collaborationT('board'),
            description: describe('board'),
            icon: Presentation,
          };
    const toolId = toolIdOf(activityId);
    if (toolId) {
      const tool =
        tools.tools.find((entry) => entry.id === toolId) ??
        findMeetTool(toolId);
      if (!tool) return null;
      const mergedKind = merged ? mergedKindOf(activityId) : null;
      if (mergedKind)
        return {
          title: t(`merged.${mergedKind}`),
          description: t(`merged.${mergedKind}_description`),
          icon: mergedKind === 'whiteboard' ? PenTool : Timer,
        };
      return {
        title: all.has(tool.label) ? all(tool.label) : tool.label,
        description: describe(tool.id),
        icon: tool.icon,
      };
    }
    if ((CLASSROOM_ACTIVITIES as readonly string[]).includes(activityId)) {
      if (activityId === 'whiteboard' && merged)
        return {
          title: t('merged.whiteboard'),
          description: t('merged.whiteboard_description'),
          icon: PenTool,
        };
      return {
        title: classroomT(`${activityId as 'whiteboard' | 'breakouts'}.title`),
        description: describe(activityId),
        icon: activityId === 'whiteboard' ? PenTool : LayoutGrid,
      };
    }
    return null;
  };

  const canOpenActivity = (activityId: string) => {
    const toolId = toolIdOf(activityId);
    if (isAvailable) {
      if (toolId)
        return (
          isAvailable(activityId) ||
          tools.tools.some((entry) => entry.id === toolId) ||
          activityId === defaultActivity
        );
      if (
        activityId === PROGRAMMING_ACTIVITY ||
        activityId === DOCUMENT_ACTIVITY
      )
        return canBrowse || isAvailable(activityId);
      return isAvailable(activityId);
    }
    if (toolId)
      return (
        tools.tools.some((entry) => entry.id === toolId) ||
        activityId === defaultActivity
      );
    return canBrowse;
  };

  const candidateIds = new Set<string>();
  const presenceEntries = Object.entries(presenceByActivity ?? {})
    .filter(([, people]) => people.length > 0)
    .sort(([idA, peopleA], [idB, peopleB]) => {
      if (peopleB.length !== peopleA.length)
        return peopleB.length - peopleA.length;
      if (idA === defaultActivity) return -1;
      if (idB === defaultActivity) return 1;
      return idA.localeCompare(idB);
    });
  for (const [id] of presenceEntries) candidateIds.add(id);
  if (defaultActivity) candidateIds.add(defaultActivity);
  for (const id of stage.openIds ?? []) candidateIds.add(id);
  for (const toolId of tools.openToolIds)
    candidateIds.add(toolActivityId(toolId));

  const openActivity = (activityId: string) => {
    if (onOpenActivity) onOpenActivity(activityId);
    else stage.open(activityId);
  };

  const liveActivities: PresenceLiveActivity[] = [];
  for (const id of candidateIds) {
    const meta = resolveMeta(id);
    if (!meta) continue;
    const toolId = toolIdOf(id);
    const isOpen =
      Boolean(stage.openIds?.includes(id)) ||
      (toolId ? tools.openToolIds.includes(toolId) : false);
    liveActivities.push({
      id,
      title: meta.title,
      description: meta.description,
      icon: meta.icon,
      participants: presenceByActivity?.[id] ?? [],
      isOpen,
      canOpen: canOpenActivity(id),
      onOpen: () => openActivity(id),
    });
  }

  const liveIds = new Set(liveActivities.map((activity) => activity.id));

  return (
    <CallPresenceRoster
      {...roster}
      liveActivities={
        liveActivities.length > 0 ? (
          <PresenceLiveActivities activities={liveActivities} />
        ) : undefined
      }
      onProgramming={
        canBrowse && !liveIds.has(PROGRAMMING_ACTIVITY)
          ? () => openActivity(PROGRAMMING_ACTIVITY)
          : undefined
      }
      onDocument={
        canBrowse && !liveIds.has(DOCUMENT_ACTIVITY)
          ? () => openActivity(DOCUMENT_ACTIVITY)
          : undefined
      }
      activities={
        openFromDock && request?.available ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-full"
            onClick={request.request}
          >
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
