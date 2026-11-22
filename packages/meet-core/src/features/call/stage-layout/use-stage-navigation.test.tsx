// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  currentRoomView,
  surfaceFromView,
} from '../components/room-navigation-policy';
import { useRoomNavigation } from '../hooks/use-room-navigation';
import { paneOfActivity } from './layout-model';
import { useStageNavigation } from './use-stage-navigation';
import { useStageLayout } from './use-stage-layout';

vi.mock('../hooks/use-room-navigation', () => ({
  useRoomNavigation: vi.fn(() => ({})),
}));

type Options = Parameters<typeof useRoomNavigation>[0];
const navigation = () =>
  vi.mocked(useRoomNavigation).mock.calls.at(-1)?.[0] as Options;

let stage: ReturnType<typeof useStageLayout>;
const onDrawer = vi.fn();
const onBroughtIn = vi.fn();

function Harness() {
  stage = useStageLayout({
    accountId: 'u',
    meetingId: 'm',
    isAvailable: () => true,
    tier: 'desktop',
  });
  useStageNavigation({
    room: {} as Options['room'],
    stage,
    drawer: 'chat',
    onDrawer,
    onBroughtIn,
    access: { browse: true, account: true, tools: true, toolIds: [] },
  });
  return null;
}

beforeEach(() => {
  onDrawer.mockClear();
  onBroughtIn.mockClear();
  render(<Harness />);
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

it('shares the activity in the focused pane as the room view', () => {
  expect(currentRoomView(navigation().surface)).toEqual({ surface: 'stage' });
  act(() => {
    stage.open('programming');
  });
  expect(currentRoomView(navigation().surface)).toEqual({
    surface: 'programming',
  });
  act(() => {
    stage.open('tool:live-qa');
  });
  expect(currentRoomView(navigation().surface)).toEqual({
    surface: 'tool',
    toolId: 'live-qa',
  });
  // The chat drawer is not a surface and stays what it was.
  expect(navigation().surface.drawer).toBe('chat');
});

it('opens a summoned activity beside what is open and keeps the chat drawer', () => {
  act(() => {
    stage.open('programming');
  });
  const next = surfaceFromView({ surface: 'tool', toolId: 'live-qa' }, 'chat');
  act(() => navigation().apply(next, { forced: false }));
  expect(stage.openIds).toEqual(['programming', 'tool:live-qa']);
  expect(stage.focused).toBe('tool:live-qa');
  expect(onDrawer).toHaveBeenLastCalledWith('chat');
  expect(onBroughtIn).not.toHaveBeenCalled();
});

it('focuses the pane that already has a summoned activity, even as a hidden tab', () => {
  act(() => {
    for (const id of ['a', 'b', 'c', 'tool:live-qa', 'd']) stage.open(id);
  });
  // tool:live-qa and d are tabs of one pane; d is in front.
  const pane = paneOfActivity(stage.layout, 'tool:live-qa');
  expect(pane?.active).toBe('d');
  act(() => {
    stage.open('a');
  });
  expect(stage.focused).toBe('a');
  act(() =>
    navigation().apply(
      surfaceFromView({ surface: 'tool', toolId: 'live-qa' }, null),
      { forced: true }
    )
  );
  expect(stage.focused).toBe('tool:live-qa');
  expect(stage.layout.focusedPaneId).toBe(pane?.id);
  expect(stage.openIds).toHaveLength(5);
});

it('marks a host-forced collaboration move so the person may open it', () => {
  act(() =>
    navigation().apply(surfaceFromView({ surface: 'document' }, null), {
      forced: true,
    })
  );
  expect(onBroughtIn).toHaveBeenCalledTimes(1);
  expect(stage.focused).toBe('document');
});

it('leaves open activities alone when brought to the stage', () => {
  act(() => {
    stage.open('programming');
  });
  act(() =>
    navigation().apply(surfaceFromView({ surface: 'stage' }, 'chat'), {
      forced: true,
    })
  );
  expect(stage.openIds).toEqual(['programming']);
  expect(onDrawer).toHaveBeenLastCalledWith('chat');
});
