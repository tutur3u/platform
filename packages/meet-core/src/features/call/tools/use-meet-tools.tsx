'use client';

import { MeetToolProvider } from './context';
import { findMeetTool, type MeetToolDefinition, meetTools } from './registry';
import { MeetToolsHub, MeetToolsMenu } from './tools-hub';

export type ToolDrawer = `tool:${string}`;

/** Older activity drawers that now open inside the tools hub. */
const activityTools: Record<string, string> = {
  polls: 'polls',
  'quiz-arena': 'quiz',
};

export function toolIdFromDrawer(drawer: string | null) {
  return drawer?.startsWith('tool:') ? drawer.slice('tool:'.length) : null;
}

/**
 * Owns the tools hub's slot in the call's single drawer. `route` replaces the
 * activity drawer setter so live poll and quiz shortcuts open the hub panels.
 */
export function useMeetTools<A extends string>({
  drawer,
  onDrawer,
  meetingId,
  accountId,
  requiresAccount,
  canManage,
  enabled,
  available,
  tools = meetTools,
}: {
  drawer: string | null;
  onDrawer: (next: A | ToolDrawer | null) => void;
  meetingId: string;
  accountId: string;
  requiresAccount: boolean;
  canManage: boolean;
  enabled: boolean;
  /** Whether this person may browse the hub (live shortcuts still open tools). */
  available: boolean;
  tools?: readonly MeetToolDefinition[];
}) {
  const activeId = toolIdFromDrawer(drawer);
  const active = findMeetTool(activeId, tools);
  const toggle = (id: string) =>
    onDrawer(activeId === id ? null : `tool:${id}`);
  const route = (next: A | null) => {
    const toolId = next ? activityTools[next] : undefined;
    if (toolId) toggle(toolId);
    else onDrawer(next);
  };
  const close = () => onDrawer(null);
  const Panel = active?.Panel;
  const shown = available && enabled ? tools : [];

  return {
    activeId,
    route,
    hub: shown.length ? (
      <MeetToolsHub tools={shown} activeId={activeId} onSelect={toggle} />
    ) : null,
    menu: shown.length ? (
      <MeetToolsMenu tools={shown} activeId={activeId} onSelect={toggle} />
    ) : null,
    panel: Panel ? (
      <MeetToolProvider
        value={{
          meetingId,
          accountId,
          requiresAccount,
          canManage,
          enabled,
          close,
        }}
      >
        <Panel
          key={activeId}
          meetingId={meetingId}
          role={canManage ? 'host' : 'participant'}
          participantId={accountId}
          onClose={close}
        />
      </MeetToolProvider>
    ) : null,
  };
}
