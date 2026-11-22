'use client';

import { toolActivityId, toolIdOf } from '../stage-layout/activity-ids';
import type { ActivityStage } from '../stage-layout/activity-ids';
import { useRef } from 'react';
import { type MeetToolContextValue, MeetToolProvider } from './context';
import { roomActivityTools } from './live-activities/activity-manager';
import { findMeetTool, type MeetToolDefinition, meetTools } from './registry';
import { MeetToolsHub, MeetToolsMenu } from './tools-hub';

/** The tools a person may browse: all, only the activities, or none. */
export function browsableTools({
  available,
  enabled,
  activitiesOnly,
  tools = meetTools,
}: {
  available: boolean;
  enabled: boolean;
  activitiesOnly?: boolean;
  tools?: readonly MeetToolDefinition[];
}) {
  const browsable = activitiesOnly ? roomActivityTools(tools) : tools;
  return available && enabled ? browsable : [];
}

/**
 * Opens the registered tools as stage activities. Several can be open at
 * once; each renders in its own pane through `renderPanel`.
 */
export function useMeetTools({
  stage,
  meetingId,
  accountId,
  requiresAccount,
  canManage,
  canRunActivities,
  enabled,
  available,
  activitiesOnly,
  selfUserId,
  people,
  tools = meetTools,
}: {
  stage: ActivityStage;
  meetingId: string;
  accountId: string;
  requiresAccount: boolean;
  canManage: boolean;
  /** The room's rule for who runs live activities; includes workspace co-hosts. */
  canRunActivities?: boolean;
  enabled: boolean;
  /** This person's room id and the room's people, for room-shared tools. */
  selfUserId?: string | null;
  people?: Readonly<Record<string, { displayName?: string } | undefined>>;
  /** Whether this person may browse the hub (live shortcuts still open tools). */
  available: boolean;
  /**
   * Set for someone who may not use the room's tools but runs its activities:
   * they browse the activities and the pen board, and nothing else.
   */
  activitiesOnly?: boolean;
  tools?: readonly MeetToolDefinition[];
}) {
  // Each open tool keeps one context value and one close handler while
  // nothing about the call changes, so a re-render of the call does not
  // re-render every open panel through its context.
  const latestStage = useRef(stage);
  latestStage.current = stage;
  const contexts = useRef(
    new Map<string, { value: MeetToolContextValue; close: () => void }>()
  );
  const contextFor = (activityId: string): MeetToolContextValue => {
    const cached = contexts.current.get(activityId);
    const close =
      cached?.close ?? (() => latestStage.current.close(activityId));
    const next: MeetToolContextValue = {
      meetingId,
      accountId,
      requiresAccount,
      canManage,
      canRunActivities,
      enabled,
      selfUserId,
      people,
      close,
    };
    const same =
      cached &&
      (Object.keys(next) as (keyof MeetToolContextValue)[]).every(
        (key) => next[key] === cached.value[key]
      );
    if (cached && same) return cached.value;
    contexts.current.set(activityId, { value: next, close });
    return next;
  };
  const toggle = (id: string) => stage.toggle(toolActivityId(id));
  const shown = browsableTools({ available, enabled, activitiesOnly, tools });
  const openIds = tools
    .map((tool) => tool.id)
    .filter((id) => stage.isOpen(toolActivityId(id)));
  // The hub highlights while any tool is open.
  const activeId = openIds[0] ?? null;

  return {
    /** Ids of the registered tools open now. */
    openIds,
    /** Tools this person may browse now, for the Activities menu. */
    shown,
    toggle,
    hub: shown.length ? (
      <MeetToolsHub tools={shown} activeId={activeId} onSelect={toggle} />
    ) : null,
    menu: shown.length ? (
      <MeetToolsMenu tools={shown} activeId={activeId} onSelect={toggle} />
    ) : null,
    /** The panel for one open tool, or null when the registry has none. */
    renderPanel: (activityId: string) => {
      const toolId = toolIdOf(activityId);
      const Panel = findMeetTool(toolId, tools)?.Panel;
      if (!toolId || !Panel) return null;
      const value = contextFor(activityId);
      return (
        <MeetToolProvider key={activityId} value={value}>
          <Panel
            meetingId={meetingId}
            roomRole={canManage ? 'host' : 'participant'}
            participantId={accountId}
            onClose={value.close}
          />
        </MeetToolProvider>
      );
    },
  };
}
