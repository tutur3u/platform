// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import type { MeetToolDefinition } from '../tools/registry';
import { ActivitiesMenu } from './activities-menu';

const ux = vi.hoisted(() => ({ v2: true }));
vi.mock('../prejoin/prejoin-context', () => ({
  useMeetUxV2: () => ux.v2,
}));

const icon = () => null;
const tool = (id: string, label: string): MeetToolDefinition => ({
  id,
  label,
  icon,
  Panel: () => null,
});
const pen = tool('pen-whiteboard', 'meet.call.live_activities.penboard.title');
const timers = tool('timers', 'meet.call.tools.timer.title');
const polls = tool('polls', 'meet.call.polls.title');
const a = messages.meet.call.activities;
const c = messages.meet.collaboration;

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  ux.v2 = true;
});

function renderMenu(withBoard = true, penBoardFirst = false) {
  const action = () => ({ active: false, toggle: vi.fn() });
  const board = action();
  const classroom = action();
  const onTool = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <NuqsTestingAdapter>
        <ActivitiesMenu
          tools={[polls, timers, pen]}
          openToolIds={[]}
          onTool={onTool}
          penBoardFirst={penBoardFirst}
          collaboration={{
            programming: action(),
            document: action(),
            ...(withBoard ? { board } : {}),
          }}
          extra={[
            {
              id: 'whiteboard',
              label: messages.meet.classroom_tools.whiteboard.title,
              icon,
              ...classroom,
            },
          ]}
          pages={[
            {
              id: 'class-timer',
              label: messages.meet.call.class_timer,
              icon,
              active: false,
              page: () => <p>Room timer page</p>,
            },
          ]}
        />
      </NuqsTestingAdapter>
    </NextIntlClientProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: a.button }));
  return { board, classroom, onTool };
}

const sidebar = () =>
  within(screen.getByRole('navigation', { name: a.title }));

it('lists one Whiteboard and one Timer with Meet UX v2', () => {
  const { board, onTool } = renderMenu();
  const nav = sidebar();
  expect(
    nav.getAllByRole('button', { name: a.merged.whiteboard })
  ).toHaveLength(1);
  expect(nav.getAllByRole('button', { name: a.merged.timer })).toHaveLength(1);
  for (const gone of [
    c.board,
    messages.meet.call.live_activities.penboard.title,
    messages.meet.call.tools.timer.title,
  ])
    expect(screen.queryByText(gone)).toBeNull();
  expect(screen.queryByText(/saved/i)).toBeNull();
  expect(screen.getByText(a.merged.whiteboard_description)).toBeTruthy();
  fireEvent.click(
    screen.getByRole('button', { name: `Start ${a.merged.whiteboard}` })
  );
  expect(board.toggle).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: a.button }));
  fireEvent.click(
    screen.getByRole('button', { name: `Start ${a.merged.timer}` })
  );
  expect(onTool).toHaveBeenCalledWith('timers');
  expect(onTool).not.toHaveBeenCalledWith('pen-whiteboard');
});

it('opens the pen board as the Whiteboard where the board is not offered', () => {
  const { classroom, onTool } = renderMenu(false);
  fireEvent.click(
    screen.getByRole('button', { name: `Start ${a.merged.whiteboard}` })
  );
  expect(onTool).toHaveBeenCalledWith('pen-whiteboard');
  expect(classroom.toggle).not.toHaveBeenCalled();
});

it('opens the pen board in a room with a guest who cannot open the board', () => {
  const { board, onTool } = renderMenu(true, true);
  fireEvent.click(
    screen.getByRole('button', { name: `Start ${a.merged.whiteboard}` })
  );
  expect(onTool).toHaveBeenCalledWith('pen-whiteboard');
  expect(board.toggle).not.toHaveBeenCalled();
});

it('keeps every older entry without Meet UX v2', () => {
  ux.v2 = false;
  renderMenu();
  const nav = sidebar();
  for (const label of [
    c.board,
    messages.meet.call.live_activities.penboard.title,
    messages.meet.classroom_tools.whiteboard.title,
    messages.meet.call.tools.timer.title,
    messages.meet.call.class_timer,
  ])
    expect(nav.getByRole('button', { name: label })).toBeTruthy();
});
