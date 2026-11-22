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
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import type { MeetToolDefinition } from '../tools/registry';
import { activityGroup, groupActivities } from './activities-catalog';
import { ActivitiesMenu } from './activities-menu';

const icon = () => null;
const tool = (id: string, label: string): MeetToolDefinition => ({
  id,
  label,
  icon,
  Panel: () => null,
});
const polls = tool('polls', 'meet.call.polls.title');
const flashcards = tool('live-flashcards', 'Flashcards');
const mystery = tool('mystery-tool', 'Mystery tool');
const a = messages.meet.call.activities;
const room = messages.meet.call.room_tools;
const pollsLabel = messages.meet.call.polls.title;

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
});

function renderMenu(props: Partial<ComponentProps<typeof ActivitiesMenu>>) {
  const action = { active: false, toggle: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <NuqsTestingAdapter>
        <ActivitiesMenu
          tools={[polls, flashcards]}
          activeToolId={null}
          onTool={vi.fn()}
          collaboration={{ programming: action, document: action }}
          {...props}
        />
      </NuqsTestingAdapter>
    </NextIntlClientProvider>
  );
  return action;
}
const open = (name: string | RegExp = a.button) =>
  fireEvent.click(screen.getByRole('button', { name }));
const dialog = () => screen.queryByRole('dialog');

it('groups activities by purpose with unknown ids in a fallback group', () => {
  expect(groupActivities([{ id: 'mystery' }, { id: 'live-qa' }])).toEqual([
    { group: 'engage', items: [{ id: 'live-qa' }] },
    { group: 'other', items: [{ id: 'mystery' }] },
  ]);
  expect(activityGroup('class-timer')).toBe('run');
  expect(activityGroup('programming')).toBe('create');
  expect(activityGroup('live-assessment')).toBe('learn');
});

it('opens a Settings-like dialog with grouped sidebar and an overview', () => {
  renderMenu({ tools: [polls, flashcards, mystery] });
  open();
  const nav = within(screen.getByRole('navigation', { name: a.title }));
  for (const label of [
    a.groups.overview,
    a.groups.engage,
    a.groups.learn,
    a.groups.create,
    a.groups.other,
  ])
    expect(nav.getByText(label)).toBeTruthy();
  expect(nav.queryByText(/Onboarding/i)).toBeNull();
  expect(nav.getByRole('button', { name: 'Mystery tool' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: a.all })).toBeTruthy();
  expect(screen.getByRole('heading', { name: a.start_section })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: a.open_now })).toBeNull();
  expect(screen.getByText(a.descriptions.polls)).toBeTruthy();
});

it('closes the dialog and opens the activity it starts', () => {
  const onTool = vi.fn();
  const collaboration = renderMenu({ onTool });
  open();
  fireEvent.click(screen.getByRole('button', { name: `Start ${pollsLabel}` }));
  expect(onTool).toHaveBeenCalledWith('polls');
  expect(dialog()).toBeNull();
  open();
  fireEvent.click(
    screen.getByRole('button', {
      name: `Start ${messages.programmingPlayground.coding}`,
    })
  );
  expect(collaboration.toggle).toHaveBeenCalledOnce();
});

it('starts from an activity page in the sidebar', () => {
  const onTool = vi.fn();
  renderMenu({ onTool });
  open();
  fireEvent.click(
    within(screen.getByRole('navigation', { name: a.title })).getByRole(
      'button',
      { name: 'Flashcards' }
    )
  );
  fireEvent.click(screen.getByRole('button', { name: 'Start Flashcards' }));
  expect(onTool).toHaveBeenCalledWith('live-flashcards');
});

it('counts open activities on the trigger and lists them under Open now', () => {
  const onTool = vi.fn();
  renderMenu({ activeToolId: 'polls', onTool });
  open('Activities, 1 open');
  expect(screen.getByRole('heading', { name: a.open_now })).toBeTruthy();
  // An activity already open stays open; Open only returns to it.
  fireEvent.click(screen.getByRole('button', { name: `Open ${pollsLabel}` }));
  expect(onTool).not.toHaveBeenCalled();
  expect(dialog()).toBeNull();
});

it('shows dialog pages in place and keeps unlisted ones out of the grid', () => {
  renderMenu({
    pages: [
      {
        id: 'class-timer',
        label: messages.meet.call.class_timer,
        icon,
        active: false,
        page: () => <p>Timer controls</p>,
      },
      {
        id: 'room-activities',
        label: room.title,
        icon,
        active: false,
        listed: false,
        page: () => <p>Room page</p>,
      },
    ],
  });
  open();
  const nav = within(screen.getByRole('navigation', { name: a.title }));
  expect(nav.getByText(a.groups.run)).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: `Open ${room.title}` })
  ).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Open Timer' }));
  expect(screen.getByText('Timer controls')).toBeTruthy();
  expect(dialog()).toBeTruthy();
  fireEvent.click(nav.getByRole('button', { name: room.title }));
  expect(screen.getByText('Room page')).toBeTruthy();
});

it('previews activities with a feedback shortcut in Showcase', () => {
  const feedback = vi.fn();
  renderMenu({ collaboration: undefined, preview: { onFeedback: feedback } });
  open();
  expect(screen.getByText(room.preview)).toBeTruthy();
  expect(
    screen.getAllByText(messages.programmingPlayground.coding).length
  ).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: /^Start / })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: room.feedback }));
  expect(feedback).toHaveBeenCalledOnce();
  expect(dialog()).toBeNull();
});

it('clears its tab when it closes so the next open starts on the overview', async () => {
  const urls: string[] = [];
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <NuqsTestingAdapter onUrlUpdate={(event) => urls.push(event.queryString)}>
        <ActivitiesMenu
          tools={[polls, flashcards]}
          activeToolId={null}
          onTool={vi.fn()}
        />
      </NuqsTestingAdapter>
    </NextIntlClientProvider>
  );
  open();
  fireEvent.click(
    within(screen.getByRole('navigation', { name: a.title })).getByRole(
      'button',
      { name: 'Flashcards' }
    )
  );
  await vi.waitFor(() =>
    expect(urls.at(-1)).toContain('activitiesTab=live-flashcards')
  );
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(dialog()).toBeNull();
  await vi.waitFor(() => expect(urls.at(-1)).not.toContain('activitiesTab'));
  open();
  expect(screen.getByRole('heading', { name: a.all })).toBeTruthy();
});

it('explains Start only to people who may Follow and Summon', async () => {
  renderMenu({ navigationAllowed: true });
  open();
  fireEvent.focus(screen.getByRole('button', { name: `Start ${pollsLabel}` }));
  expect((await screen.findByRole('tooltip')).textContent).toContain(a.hint);
  expect(a.hint).toBe('Opens for you; Summon brings others');
  cleanup();
  renderMenu({});
  open();
  const start = screen.getByRole('button', { name: `Start ${pollsLabel}` });
  fireEvent.focus(start);
  expect(start.getAttribute('data-state')).toBeNull();
  expect(screen.queryByRole('tooltip')).toBeNull();
});

it('marks open activities with a neutral badge', () => {
  renderMenu({ activeToolId: 'polls' });
  open('Activities, 1 open');
  const badge = screen
    .getAllByText(a.open_state)
    .find((element) => element.tagName === 'SPAN');
  if (!badge) throw new Error('missing open badge');
  expect(badge.className).toContain('bg-muted');
  expect(badge.className).not.toContain('dynamic-');
});
