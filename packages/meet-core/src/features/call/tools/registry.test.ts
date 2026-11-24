import { expect, it } from 'vitest';
import en from '../../../../../../apps/meet/messages/en.json';
import vi from '../../../../../../apps/meet/messages/vi.json';
import { runsRoomActivities } from './live-activities/activity-manager';
import { findMeetTool, meetToolsFor } from './registry';
import { upskiiTool } from './upskii/definition';
import { upskiiPanelView } from './upskii/upskii-panel-view';
import { browsableTools } from './use-meet-tools';

// Every tool the hub can offer, the assessment included, whatever the room is
// configured to offer now.
const meetTools = meetToolsFor({ assessment: true });

const read = (bundle: unknown, key: string) =>
  key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object'
          ? (node as Record<string, unknown>)[part]
          : undefined,
      bundle
    );

it.each(meetTools.map((tool) => [tool.id, tool] as const))(
  'names and describes %s in both languages',
  (id, tool) => {
    for (const bundle of [en, vi]) {
      // A label that is not a message key would show raw text in the menu.
      expect(read(bundle, tool.label), tool.label).toBeTypeOf('string');
      expect(
        (bundle.meet.call.activities.descriptions as Record<string, string>)[id]
      ).toBeTypeOf('string');
    }
  }
);

it('tells the pen whiteboard apart from the classroom whiteboard', () => {
  const labels = meetTools.map((tool) => read(en, tool.label));
  expect(new Set(labels).size).toBe(labels.length);
  expect(labels).not.toContain(en.meet.classroom_tools.whiteboard.title);
});

it('registers the Upskii presenter for hosts and co-hosts, and keeps plain participants absent or view-only', () => {
  for (const assessment of [true, false]) {
    const tools = meetToolsFor({ assessment });
    expect(findMeetTool('upskii', tools)).toBe(upskiiTool);

    // Host (can browse all tools and run activities).
    const hostTools = browsableTools({
      available: true,
      enabled: true,
      activitiesOnly: false,
      tools,
    });
    expect(hostTools).toContain(upskiiTool);

    // Co-host (runs room activities when general tool browsing is host-only).
    const cohostCanRun = runsRoomActivities({
      role: 'speaker',
      canManageParticipants: false,
      classRole: 'cohost',
    });
    expect(cohostCanRun).toBe(true);
    const cohostTools = browsableTools({
      available: cohostCanRun,
      enabled: true,
      activitiesOnly: true,
      tools,
    });
    expect(cohostTools).toContain(upskiiTool);

    // Plain participant in a host-only room: absent from the menu.
    const participantCanRun = runsRoomActivities({
      role: 'speaker',
      canManageParticipants: false,
      classRole: 'participant',
    });
    expect(participantCanRun).toBe(false);
    expect(
      browsableTools({
        available: participantCanRun,
        enabled: true,
        activitiesOnly: true,
        tools,
      })
    ).toEqual([]);
  }

  // When a plain participant opens the panel (summoned or everyone mode), it is view-only.
  expect(
    upskiiPanelView(
      { connected: true, presentation: null, canPresent: false },
      true
    )
  ).toEqual({ kind: 'waiting' });
  const presentation = {
    item: {
      kind: 'lesson' as const,
      id: 'l1',
      title: 'Intro',
      url: 'https://app.upskii.com/classes/c1/lessons/l1',
    },
    presenterId: 'host',
    startedAt: '2026-12-05T08:00:00Z',
    revision: 1,
  };
  expect(
    upskiiPanelView({ connected: true, presentation, canPresent: false }, true)
  ).toEqual({
    kind: 'presenting',
    presentation,
    canPresent: false,
  });
});
