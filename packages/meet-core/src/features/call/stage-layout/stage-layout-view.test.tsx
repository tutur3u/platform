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
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import {
  ActivitiesRequestProvider,
  useActivitiesRequest,
} from './activities-request';
import { ActivityShell } from './activity-shell';
import { useActivityActive } from './activity-pane-context';
import type { ViewportTier } from './layout-model';
import { StageLayoutView } from './stage-layout-view';
import { useStageLayout } from './use-stage-layout';

const mounts: Record<string, number> = {};
const Probe = ({ id }: { id: string }) => {
  const active = useActivityActive();
  useEffect(() => {
    mounts[id] = (mounts[id] ?? 0) + 1;
  }, [id]);
  return (
    <ActivityShell title={id}>
      <input aria-label={`${id} input`} placeholder={`Type in ${id}`} />
      <output data-testid={`${id}-active`}>{String(active)}</output>
    </ActivityShell>
  );
};

let controller: ReturnType<typeof useStageLayout>;
const icon = () => null;

function Harness({ tier = 'desktop' as ViewportTier }) {
  const stage = useStageLayout({
    accountId: 'u',
    meetingId: 'm',
    isAvailable: () => true,
    tier,
  });
  controller = stage;
  const [people] = useState(() => <p data-testid="people">people</p>);
  return (
    <div style={{ width: 1000, height: 600 }}>
      <StageLayoutView
        controller={stage}
        peopleCount={4}
        stage={people}
        activities={stage.openIds.map((id) => ({
          id,
          title: id,
          icon,
          content: <Probe id={id} />,
        }))}
      />
    </div>
  );
}

const view = (tier: ViewportTier = 'desktop') =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Harness tier={tier} />
    </NextIntlClientProvider>
  );
const open = (...ids: string[]) =>
  act(() => {
    for (const id of ids) controller.open(id);
  });

const sizes = new Map<string, { width: number; height: number }>();
beforeEach(() => {
  for (const key of Object.keys(mounts)) delete mounts[key];
  sizes.clear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        const size = sizes.get(
          (target as HTMLElement).dataset.activityId ?? ''
        );
        if (size)
          this.callback(
            [{ target, contentRect: size } as ResizeObserverEntry],
            this as unknown as ResizeObserver
          );
      }
      unobserve() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

it('renders open activities as panes with accessible separators that arrow keys resize', () => {
  view();
  open('a', 'b');
  const separator = screen.getByRole('separator');
  expect(separator.getAttribute('aria-orientation')).toBe('vertical');
  expect(separator.getAttribute('aria-valuenow')).toBe('50');
  expect(separator.getAttribute('aria-valuemin')).toBe('15');
  expect(separator.getAttribute('aria-valuemax')).toBe('85');
  expect(separator.getAttribute('aria-label')).toBe('Resize a and b');
  fireEvent.keyDown(separator, { key: 'ArrowRight' });
  expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe(
    '55'
  );
  fireEvent.keyDown(screen.getByRole('separator'), {
    key: 'ArrowLeft',
    shiftKey: true,
  });
  expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe(
    '40'
  );
  fireEvent.keyDown(screen.getByRole('separator'), { key: 'End' });
  expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe(
    '85'
  );
  fireEvent.keyDown(screen.getByRole('separator'), { key: 'Home' });
  expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe(
    '15'
  );
  fireEvent.keyDown(screen.getByRole('separator'), { key: 'Enter' });
  expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe(
    '50'
  );
});

it('uses a horizontal separator for a pane split top to bottom', () => {
  view();
  open('a', 'b', 'c');
  const separators = screen.getAllByRole('separator');
  expect(separators.map((s) => s.getAttribute('aria-orientation'))).toEqual([
    'vertical',
    'horizontal',
  ]);
  fireEvent.keyDown(separators[1] as HTMLElement, { key: 'ArrowDown' });
  expect(
    screen.getAllByRole('separator')[1]?.getAttribute('aria-valuenow')
  ).toBe('55');
});

it('keeps hidden tabs and maximized-over panes mounted, never remounting them', () => {
  view();
  open('a', 'b', 'c', 'd');
  expect(mounts).toEqual({ a: 1, b: 1, c: 1, d: 1 });
  // c is a hidden tab behind d.
  expect(screen.getByTestId('c-active').textContent).toBe('false');
  expect(screen.getByTestId('d-active').textContent).toBe('true');
  act(() => controller.open('c'));
  expect(screen.getByTestId('c-active').textContent).toBe('true');
  expect(screen.getByTestId('d-active').textContent).toBe('false');
  // Maximize one pane: the others stay in the DOM, inactive.
  const paneA = controller.layout.root && screen.getByTestId('a-active');
  act(() => controller.maximize(controller.layout.focusedPaneId));
  expect(paneA?.isConnected).toBe(true);
  expect(screen.getByTestId('a-active').textContent).toBe('false');
  expect(screen.getByTestId('c-active').textContent).toBe('true');
  expect(screen.queryAllByRole('separator')).toHaveLength(0);
  act(() => controller.maximize(null));
  expect(screen.getAllByRole('separator')).toHaveLength(2);
  expect(screen.getByTestId('a-active').textContent).toBe('true');
  // Splitting and resizing along the way never remounted anything.
  expect(mounts).toEqual({ a: 1, b: 1, c: 1, d: 1 });
});

it('keeps the people mounted while the video moves between full, row and pill', () => {
  view();
  const people = screen.getByTestId('people');
  open('a');
  expect(screen.getByTestId('people')).toBe(people);
  fireEvent.click(screen.getByRole('button', { name: 'Collapse video' }));
  expect(screen.getByTestId('people')).toBe(people);
  fireEvent.click(screen.getByRole('button', { name: 'Show video' }));
  expect(screen.getByTestId('people')).toBe(people);
  act(() => controller.close('a'));
  expect(screen.getByTestId('people')).toBe(people);
});

it('shows a Needs more room card below 280 by 220 and maximizes from it', () => {
  sizes.set('a', { width: 400, height: 400 });
  sizes.set('b', { width: 240, height: 400 });
  view();
  open('a', 'b');
  expect(screen.getAllByText('Needs more room')).toHaveLength(1);
  const card = screen.getByText('Needs more room').closest('[role="status"]');
  expect(card).toBeTruthy();
  // The activity stays mounted behind the card.
  expect(mounts.b).toBe(1);
  fireEvent.click(
    within(card as HTMLElement).getByRole('button', { name: 'Maximize' })
  );
  expect(controller.layout.maximizedPaneId).not.toBeNull();
});

it('offers no maximize from the card on a single pane', () => {
  sizes.set('a', { width: 200, height: 150 });
  view();
  open('a');
  expect(screen.getByText('Needs more room')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Maximize' })).toBeNull();
});

it('tags each pane with its container-query size class', () => {
  sizes.set('a', { width: 300, height: 400 });
  sizes.set('b', { width: 500, height: 400 });
  sizes.set('c', { width: 900, height: 400 });
  view();
  open('a', 'b', 'c');
  const size = (id: string) =>
    document
      .querySelector(`[data-activity-id="${id}"]`)
      ?.getAttribute('data-size');
  expect([size('a'), size('b'), size('c')]).toEqual([
    'compact',
    'medium',
    'wide',
  ]);
});

it('reorders panes from the keyboard and focuses the pane being worked in', () => {
  view();
  open('a', 'b');
  const order = () =>
    [...document.querySelectorAll('section[data-pane-id] h2')].map(
      (heading) => heading.textContent
    );
  expect(order()).toEqual(['a', 'b']);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Move a' }), {
    key: 'ArrowRight',
  });
  expect(order()).toEqual(['b', 'a']);
  const paneA = document.querySelector('[data-pane-id]') as HTMLElement;
  fireEvent.pointerDown(paneA);
  expect(paneA.getAttribute('data-focused')).toBe('true');
});

it('cycles focus between panes with F6', () => {
  view();
  open('a', 'b');
  const group = screen.getByRole('group', { name: 'Open activities' });
  const first = controller.layout.focusedPaneId;
  fireEvent.keyDown(group, { key: 'F6' });
  expect(controller.layout.focusedPaneId).not.toBe(first);
  fireEvent.keyDown(group, { key: 'F6', shiftKey: true });
  expect(controller.layout.focusedPaneId).toBe(first);
});

it('shows one activity at a time on a phone with a switcher sheet', () => {
  view('phone');
  open('a', 'b', 'c');
  expect(screen.queryAllByRole('separator')).toHaveLength(0);
  expect(screen.queryByRole('tablist')).toBeNull();
  expect(screen.getByTestId('c-active').textContent).toBe('true');
  expect(screen.getByTestId('a-active').textContent).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: 'c' }));
  const sheet = screen.getByRole('dialog', { name: 'Open activities' });
  const items = within(sheet).getAllByRole('listitem');
  expect(items.map((item) => item.textContent)).toEqual(['a', 'b', 'cShowing']);
  fireEvent.click(within(sheet).getByRole('button', { name: 'a' }));
  expect(screen.getByTestId('a-active').textContent).toBe('true');
  expect(screen.getByTestId('c-active').textContent).toBe('false');
  expect(mounts).toEqual({ a: 1, b: 1, c: 1 });
});

it('stacks activities as tabs past the pane limit and switches by keyboard', () => {
  view('tablet');
  open('a', 'b', 'c');
  const tabs = screen.getAllByRole('tab');
  expect(tabs.map((tab) => tab.textContent)).toEqual(['b', 'c']);
  expect(screen.getAllByRole('separator')).toHaveLength(1);
  fireEvent.keyDown(screen.getByRole('tab', { name: 'c' }), {
    key: 'ArrowLeft',
  });
  expect(
    screen.getByRole('tab', { name: 'b' }).getAttribute('aria-selected')
  ).toBe('true');
  fireEvent.keyDown(screen.getByRole('tab', { name: 'b' }), {
    key: 'ArrowRight',
    altKey: true,
  });
  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
    'c',
    'b',
  ]);
});

it('closes one activity from its pane header', () => {
  view();
  open('a', 'b');
  fireEvent.click(screen.getByRole('button', { name: 'Close a' }));
  expect(controller.openIds).toEqual(['b']);
});

it('renders the shared loading, empty and error states', () => {
  const retry = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ActivityShell title="Poll" state={{ kind: 'loading' }} />
      <ActivityShell
        title="Quiz"
        state={{ kind: 'empty', title: 'No quiz yet' }}
      />
      <ActivityShell title="Q&A" state={{ kind: 'error', onRetry: retry }} />
    </NextIntlClientProvider>
  );
  expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
  expect(screen.getByText('No quiz yet')).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toContain("Couldn't load");
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(retry).toHaveBeenCalledTimes(1);
});

it('links each tab to its panel', () => {
  view('tablet');
  open('a', 'b', 'c');
  const tab = screen.getByRole('tab', { name: 'b' });
  const panel = document.getElementById(
    tab.getAttribute('aria-controls') ?? ''
  );
  expect(panel?.getAttribute('role')).toBe('tabpanel');
  expect(panel?.getAttribute('aria-labelledby')).toBe(tab.id);
  // A pane with one activity has no tabs and so no tab panel.
  expect(
    document.querySelector('[data-activity-id="a"]')?.getAttribute('role')
  ).toBeNull();
});

it('previews a drag locally and saves the split once on release', () => {
  vi.stubGlobal('requestAnimationFrame', (run: () => void) => {
    run();
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  view();
  open('a', 'b');
  const stage = document.querySelector('[role="group"]') as HTMLElement;
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
    width: 1000,
    height: 600,
    top: 0,
    left: 0,
    right: 1000,
    bottom: 600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  const setItem = vi.spyOn(Storage.prototype, 'setItem');
  const separator = () => screen.getByRole('separator');
  const saved = controller.layout;
  Object.assign(separator(), {
    setPointerCapture: () => {},
    focus: () => {},
  });
  fireEvent.pointerDown(separator(), { pointerId: 1, button: 0, clientX: 500 });
  fireEvent.pointerMove(separator(), { pointerId: 1, clientX: 600 });
  // The separator follows the pointer; nothing has been saved or re-rendered
  // through the call's layout state.
  expect(separator().getAttribute('aria-valuenow')).toBe('60');
  expect(controller.layout).toBe(saved);
  fireEvent.pointerMove(separator(), { pointerId: 1, clientX: 700 });
  expect(separator().getAttribute('aria-valuenow')).toBe('70');
  expect(controller.layout).toBe(saved);
  expect(setItem).not.toHaveBeenCalled();
  fireEvent.pointerUp(separator(), { pointerId: 1 });
  expect(separator().getAttribute('aria-valuenow')).toBe('70');
  expect(
    controller.layout.root?.kind === 'split' && controller.layout.root.sizes
  ).toEqual([70, 30]);
  setItem.mockRestore();
});

it('does not touch the saved layout when the only pane is pressed', () => {
  view();
  open('a');
  const setItem = vi.spyOn(Storage.prototype, 'setItem');
  const pane = document.querySelector('[data-pane-id]') as HTMLElement;
  fireEvent.pointerDown(pane);
  fireEvent.pointerDown(pane);
  fireEvent.focus(pane);
  expect(setItem.mock.calls).toEqual([]);
  setItem.mockRestore();
});

it('drops a drag preview when the separator goes away mid-drag', () => {
  vi.stubGlobal('requestAnimationFrame', (run: () => void) => {
    run();
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  view();
  open('a', 'b');
  const stage = document.querySelector('[role="group"]') as HTMLElement;
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
    width: 1000,
    height: 600,
    top: 0,
    left: 0,
    right: 1000,
    bottom: 600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  const separator = screen.getByRole('separator');
  Object.assign(separator, { setPointerCapture: () => {}, focus: () => {} });
  fireEvent.pointerDown(separator, { pointerId: 1, button: 0, clientX: 500 });
  fireEvent.pointerMove(separator, { pointerId: 1, clientX: 700 });
  expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe(
    '70'
  );
  // Maximizing unmounts the separator without a pointer release.
  act(() => controller.maximize(controller.layout.focusedPaneId));
  expect(screen.queryAllByRole('separator')).toHaveLength(0);
  act(() => controller.maximize(null));
  expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe(
    '50'
  );
});

function Menu() {
  const register = useActivitiesRequest()?.register;
  useEffect(() => register?.(), [register]);
  return null;
}

function Phone({ menu }: { menu: boolean }) {
  const request = useActivitiesRequest();
  requests = request?.count ?? 0;
  return (
    <>
      {menu && <Menu />}
      <Harness tier="phone" />
    </>
  );
}
let requests = 0;
const phone = (menu: boolean) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ActivitiesRequestProvider>
        <Phone menu={menu} />
      </ActivitiesRequestProvider>
    </NextIntlClientProvider>
  );

it('offers Open another activity on the phone switcher only with a menu to open', () => {
  phone(false);
  open('a', 'b');
  fireEvent.click(screen.getByRole('button', { name: 'b' }));
  expect(
    screen.queryByRole('button', { name: 'Open another activity' })
  ).toBeNull();
});

it('asks for the Activities dialog only after the switcher sheet has closed', async () => {
  phone(true);
  open('a', 'b');
  fireEvent.click(screen.getByRole('button', { name: 'b' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Open another activity' })
  );
  await waitFor(() => expect(requests).toBe(1));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.body.style.pointerEvents).not.toBe('none');
});

it('counts the pane frame toward the 280 by 220 minimum', () => {
  // Bodies measured inside the pane: its border and header take 2 and 45.
  sizes.set('a', { width: 278, height: 175 });
  sizes.set('b', { width: 277, height: 175 });
  sizes.set('c', { width: 278, height: 174 });
  view();
  open('a', 'b', 'c');
  const small = (id: string) =>
    document
      .querySelector(`[data-activity-id="${id}"]`)
      ?.textContent?.includes('Needs more room');
  expect([small('a'), small('b'), small('c')]).toEqual([false, true, true]);
});
