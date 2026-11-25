// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import type { MeetToolDefinition } from '../tools/registry';
import { RoomStage } from './room-stage';
import type { StageActivity } from './stage-layout-view';
import type { StageLayoutController } from './use-stage-layout';

const ux = vi.hoisted(() => ({ v2: true }));
vi.mock('../prejoin/prejoin-context', () => ({
  useMeetUxV2: () => ux.v2,
}));
// The pane chrome, the dock chip and the phone switcher all name a pane
// from the title RoomStage gives it.
const seen = vi.hoisted(() => ({ activities: [] as StageActivity[] }));
vi.mock('./stage-layout-view', () => ({
  StageLayoutView: ({ activities }: { activities: StageActivity[] }) => {
    seen.activities = activities;
    return null;
  },
}));

afterEach(() => {
  cleanup();
  ux.v2 = true;
});

const icon = () => null;
const tool = (id: string, label: string): MeetToolDefinition => ({
  id,
  label,
  icon,
  Panel: () => null,
});
const tools = [
  tool('pen-whiteboard', 'meet.call.live_activities.penboard.title'),
  tool('timers', 'meet.call.tools.timer.title'),
  tool('polls', 'meet.call.polls.title'),
];
const openIds = [
  'board',
  'tool:pen-whiteboard',
  'whiteboard',
  'tool:timers',
  'tool:polls',
];

function titles() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RoomStage
        controller={{ openIds } as unknown as StageLayoutController}
        stage={null}
        peopleCount={1}
        tools={tools}
        renderTool={() => null}
        renderClassroom={() => null}
        renderCollaboration={() => null}
      />
    </NextIntlClientProvider>
  );
  return Object.fromEntries(
    seen.activities.map((activity) => [activity.id, activity.title])
  );
}

const merged = messages.meet.call.activities.merged;

it('names every older whiteboard and timer pane after the merged one', () => {
  expect(titles()).toEqual({
    board: merged.whiteboard,
    'tool:pen-whiteboard': merged.whiteboard,
    whiteboard: merged.whiteboard,
    'tool:timers': merged.timer,
    'tool:polls': messages.meet.call.polls.title,
  });
});

it('keeps the older names without Meet UX v2', () => {
  ux.v2 = false;
  expect(titles()).toEqual({
    board: messages.meet.collaboration.board,
    'tool:pen-whiteboard': messages.meet.call.live_activities.penboard.title,
    whiteboard: messages.meet.classroom_tools.whiteboard.title,
    'tool:timers': messages.meet.call.tools.timer.title,
    'tool:polls': messages.meet.call.polls.title,
  });
});
