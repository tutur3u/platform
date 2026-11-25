// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import type { MeetToolDefinition } from '../tools/registry';
import { activityGroup, groupActivities } from './activities-catalog';
import {
  ActivitiesRequestProvider,
  useActivitiesRequest,
} from '../stage-layout/activities-request';
import type { ActivityNavigation } from './activity-launch-control';
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
          openToolIds={[]}
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
  renderMenu({ openToolIds: ['polls'], onTool });
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
          openToolIds={[]}
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
  expect(urls.some((url) => url.includes('settingsTab'))).toBe(false);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(dialog()).toBeNull();
  await vi.waitFor(() => expect(urls.at(-1)).not.toContain('activitiesTab'));
  open();
  expect(screen.getByRole('heading', { name: a.all })).toBeTruthy();
});

it('shows the activity name and description on its detail page and resets the tab when it starts', async () => {
  const urls: string[] = [];
  const onTool = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <NuqsTestingAdapter
        searchParams="?activitiesTab=polls"
        onUrlUpdate={(event) => urls.push(event.queryString)}
      >
        <ActivitiesMenu
          tools={[polls, flashcards]}
          openToolIds={[]}
          onTool={onTool}
        />
      </NuqsTestingAdapter>
    </NextIntlClientProvider>
  );
  open();
  expect(screen.getAllByText(pollsLabel).length).toBeGreaterThan(1);
  expect(screen.getAllByText(a.descriptions.polls).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: `Start ${pollsLabel}` }));
  expect(onTool).toHaveBeenCalledWith('polls');
  await vi.waitFor(() => expect(urls.at(-1)).not.toContain('activitiesTab'));
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
  renderMenu({ openToolIds: ['polls'] });
  open('Activities, 1 open');
  const badge = screen
    .getAllByText(a.open_state)
    .find((element) => element.tagName === 'SPAN');
  if (!badge) throw new Error('missing open badge');
  expect(badge.className).toContain('bg-muted');
  expect(badge.className).not.toContain('dynamic-');
});

it('opens when the stage asks for it and not before', () => {
  let ask: () => void = () => {};
  function Ask() {
    ask = useActivitiesRequest()?.request ?? ask;
    return null;
  }
  const action = { active: false, toggle: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <NuqsTestingAdapter>
        <ActivitiesRequestProvider>
          <Ask />
          <ActivitiesMenu
            tools={[polls, flashcards]}
            openToolIds={[]}
            onTool={vi.fn()}
            collaboration={{ programming: action, document: action }}
          />
        </ActivitiesRequestProvider>
      </NuqsTestingAdapter>
    </NextIntlClientProvider>
  );
  expect(dialog()).toBeNull();
  act(() => ask());
  expect(dialog()).not.toBeNull();
  fireEvent.keyDown(dialog() as HTMLElement, { key: 'Escape' });
  expect(dialog()).toBeNull();
  act(() => ask());
  expect(dialog()).not.toBeNull();
});

it('ignores a request while there is nothing to show and registers once there is', () => {
  let ask: () => void = () => {};
  let available = false;
  function Ask() {
    const request = useActivitiesRequest();
    ask = request?.request ?? ask;
    available = !!request?.available;
    return null;
  }
  const action = { active: false, toggle: vi.fn() };
  const tree = (tools: ComponentProps<typeof ActivitiesMenu>['tools']) => (
    <NextIntlClientProvider locale="en" messages={messages}>
      <NuqsTestingAdapter>
        <ActivitiesRequestProvider>
          <Ask />
          <ActivitiesMenu
            tools={tools}
            openToolIds={[]}
            onTool={vi.fn()}
            {...(tools.length
              ? { collaboration: { programming: action, document: action } }
              : {})}
          />
        </ActivitiesRequestProvider>
      </NuqsTestingAdapter>
    </NextIntlClientProvider>
  );
  const view = render(tree([]));
  expect(available).toBe(false);
  act(() => ask());
  view.rerender(tree([polls]));
  // The request came while the menu rendered nothing, so it does not linger.
  expect(dialog()).toBeNull();
  expect(available).toBe(true);
  act(() => ask());
  expect(dialog()).not.toBeNull();
});

function activityNavigation(allowed: boolean) {
  return {
    allowed,
    canManage: allowed,
    leading: null,
    others: [{ userId: 'peer', displayName: 'Peer' }],
    paused: false,
    reveal: vi.fn(),
    summon: vi.fn(),
    openFollow: vi.fn(),
    openSummon: vi.fn(),
    stopLeading: vi.fn(),
  };
}

it('opens an activity locally with one primary button', () => {
  const navigation = activityNavigation(true);
  renderMenu({ navigation });
  open();
  const name = `Open ${pollsLabel}`;
  const buttons = screen.getAllByRole('button', { name, exact: true });
  expect(buttons).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name, exact: true }));
  expect(navigation.reveal).toHaveBeenCalledWith('tool:polls');
  expect(navigation.summon).not.toHaveBeenCalled();
});

it('shows Bring everyone in the split menu and summons the selected activity', () => {
  const navigation = activityNavigation(true);
  renderMenu({ navigation });
  open();
  fireEvent.keyDown(
    screen.getByRole('button', { name: `More ways to open ${pollsLabel}` }),
    { key: 'Enter' }
  );
  fireEvent.click(screen.getByRole('menuitem', { name: a.bring_everyone }));
  expect(navigation.summon).toHaveBeenCalledWith('everyone', {
    surface: 'tool',
    toolId: 'polls',
  });
  expect(navigation.reveal).toHaveBeenCalledWith('tool:polls');
});

it('keeps local Open available when the room disallows navigation', () => {
  const navigation = activityNavigation(false);
  renderMenu({ navigation });
  open();

  expect(screen.queryByRole('button', { name: /^More ways to open/ })).toBeNull();
  expect(screen.queryByRole('menuitem', { name: a.bring_everyone })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: `Open ${pollsLabel}` }));
  expect(navigation.reveal).toHaveBeenCalledWith('tool:polls');
  expect(navigation.summon).not.toHaveBeenCalled();
});

const showPollOptions = () => {
  const options = screen.getByRole('button', {
    name: `More ways to open ${pollsLabel}`,
  });
  options.focus();
  fireEvent.keyDown(options, { key: 'Enter' });
  return options;
};

it('closes Activities and returns focus to its trigger before opening Follow', async () => {
  const navigation = activityNavigation(true);
  renderMenu({ navigation });
  const trigger = screen.getByRole('button', { name: a.button });
  navigation.openFollow.mockImplementation((origin) => {
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(origin).toBe(trigger);
  });
  open();
  showPollOptions();
  fireEvent.click(
    screen.getByRole('menuitem', { name: messages.meet.call.follow.button })
  );
  await waitFor(() => expect(navigation.openFollow).toHaveBeenCalledOnce());
  expect(navigation.reveal).toHaveBeenCalledWith('tool:polls');
});

it('stops leading without launching an activity or closing Activities', async () => {
  const navigation = {
    ...activityNavigation(true),
    leading: { targets: 'everyone', count: 1 },
  } satisfies ActivityNavigation;
  renderMenu({ navigation });
  open();
  const options = showPollOptions();
  fireEvent.click(
    screen.getByRole('menuitem', { name: messages.meet.call.follow.stop })
  );
  expect(navigation.stopLeading).toHaveBeenCalledOnce();
  expect(navigation.openFollow).not.toHaveBeenCalled();
  expect(navigation.reveal).not.toHaveBeenCalled();
  expect(dialog()).toBeTruthy();
  await waitFor(() => expect(document.activeElement).toBe(options));
});

it('opens targeted Summon with the selected activity after closing Activities', async () => {
  const navigation = activityNavigation(true);
  renderMenu({ navigation });
  const trigger = screen.getByRole('button', { name: a.button });
  open();
  showPollOptions();
  fireEvent.click(screen.getByRole('menuitem', { name: a.choose_people }));
  await waitFor(() =>
    expect(navigation.openSummon).toHaveBeenCalledWith(
      { surface: 'tool', toolId: 'polls' },
      trigger
    )
  );
  expect(dialog()).toBeNull();
  expect(navigation.summon).not.toHaveBeenCalled();
});

it.each([
  { paused: false, others: [], reason: messages.meet.call.navigation.alone },
  {
    paused: true,
    others: [{ userId: 'peer', displayName: 'Peer' }],
    reason: messages.meet.call.navigation.rate_limited,
  },
])('describes disabled room actions with "$reason"', ({ paused, others, reason }) => {
  renderMenu({ navigation: { ...activityNavigation(true), paused, others } });
  open();
  showPollOptions();
  for (const label of [a.bring_everyone, a.choose_people, messages.meet.call.follow.button]) {
    const item = screen.getByRole('menuitem', { name: label });
    expect(item.getAttribute('aria-disabled')).toBe('true');
    const description = item.getAttribute('aria-describedby');
    expect(document.getElementById(description ?? '')?.textContent).toBe(reason);
  }
});
