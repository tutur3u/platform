// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import vi_messages from '../../../../../../apps/meet/messages/vi.json';
import { ActivityShell } from './activity-shell';
import type { ViewportTier } from './layout-model';
import { StageLayoutView } from './stage-layout-view';
import { useStageLayout } from './use-stage-layout';

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
    <StageLayoutView
      controller={stage}
      peopleCount={4}
      stage={people}
      activities={stage.openIds.map((id) => ({
        id,
        title: id,
        icon,
        content: (
          <ActivityShell title={id}>
            <input aria-label={`${id} input`} />
          </ActivityShell>
        ),
      }))}
    />
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

// The browser's fullscreen stack: the last element is the fullscreen element.
let stack: Element[] = [];
const request = vi.fn(() => Promise.resolve());
// Each exit pops one element, as a real browser does for nested fullscreen.
const exit = vi.fn(() => {
  stack.pop();
  document.dispatchEvent(new Event('fullscreenchange'));
  return Promise.resolve();
});
/** The browser entering or leaving fullscreen on `element`, with its event. */
const setFullscreen = (element: Element | null) =>
  act(() => {
    stack = element ? [element] : [];
    document.dispatchEvent(new Event('fullscreenchange'));
  });
/** An element taking fullscreen for itself on top of the current one. */
const pushFullscreen = (element: Element) =>
  act(() => {
    stack.push(element);
    document.dispatchEvent(new Event('fullscreenchange'));
  });
const asked = () => request.mock.contexts.at(-1) as Element;
beforeEach(() => {
  stack = [];
  request.mockClear();
  exit.mockClear();
  Object.defineProperty(document, 'fullscreenEnabled', {
    configurable: true,
    get: () => true,
  });
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => stack.at(-1) ?? null,
  });
  document.exitFullscreen = exit;
  HTMLElement.prototype.requestFullscreen = request;
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

it('maximizes a lone pane and folds the people into a small overlay', () => {
  view();
  open('a');
  const people = screen.getByTestId('people');
  fireEvent.click(screen.getByRole('button', { name: 'Maximize a' }));
  expect(controller.layout.maximizedPaneId).not.toBeNull();
  // The same element stays mounted, now floating over the pane.
  expect(screen.getByTestId('people')).toBe(people);
  expect(people.parentElement?.className).toContain('absolute');
  fireEvent.click(screen.getByRole('button', { name: 'Restore a' }));
  expect(controller.layout.maximizedPaneId).toBeNull();
  expect(people.parentElement?.className).not.toContain('absolute');
});

it('lets the overlay be hidden and shown again without remounting the people', () => {
  view();
  open('a');
  const people = screen.getByTestId('people');
  fireEvent.click(screen.getByRole('button', { name: 'Maximize a' }));
  fireEvent.click(screen.getByRole('button', { name: 'Collapse video' }));
  expect(screen.getByTestId('people')).toBe(people);
  fireEvent.click(screen.getByRole('button', { name: 'Show video' }));
  expect(screen.getByTestId('people')).toBe(people);
});

it('takes the whole document fullscreen, so portals and the dock stay visible', () => {
  view();
  open('a', 'b');
  expect(controller.layout.maximizedPaneId).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Full screen a' }));
  expect(request).toHaveBeenCalledTimes(1);
  // Not a subtree: menus, tooltips, dialogs, toasts and the dock live outside it.
  expect(asked()).toBe(document.documentElement);
  expect(controller.layout.maximizedPaneId).not.toBeNull();
  setFullscreen(document.documentElement);
  expect(document.documentElement.hasAttribute('data-stage-fullscreen')).toBe(
    true
  );
  const exitButton = screen.getByRole('button', { name: 'Exit full screen a' });
  expect(exitButton.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(exitButton);
  expect(exit).toHaveBeenCalledTimes(1);
  // The browser's Esc and the toggle both end in the same event.
  setFullscreen(null);
  expect(document.documentElement.hasAttribute('data-stage-fullscreen')).toBe(
    false
  );
  expect(controller.layout.maximizedPaneId).toBeNull();
  expect(screen.getByRole('button', { name: 'Full screen a' })).toBeTruthy();
});

it('keeps the people mounted through fullscreen', () => {
  view();
  open('a');
  const people = screen.getByTestId('people');
  fireEvent.click(screen.getByRole('button', { name: 'Full screen a' }));
  setFullscreen(document.documentElement);
  expect(screen.getByTestId('people')).toBe(people);
  setFullscreen(null);
  expect(screen.getByTestId('people')).toBe(people);
});

it('keeps an existing maximize when fullscreen ends', () => {
  view();
  open('a', 'b');
  fireEvent.click(screen.getAllByRole('button', { name: /^Maximize/ })[0]!);
  const maximized = controller.layout.maximizedPaneId;
  expect(maximized).not.toBeNull();
  fireEvent.click(screen.getAllByRole('button', { name: /^Full screen/ })[0]!);
  setFullscreen(document.documentElement);
  setFullscreen(null);
  expect(controller.layout.maximizedPaneId).toBe(maximized);
});

it("does not end the stage's fullscreen when a tile takes fullscreen for itself", () => {
  view();
  open('a', 'b');
  const before = controller.layout.maximizedPaneId;
  fireEvent.click(screen.getAllByRole('button', { name: /^Full screen/ })[0]!);
  setFullscreen(document.documentElement);
  const maximized = controller.layout.maximizedPaneId;
  expect(maximized).not.toBeNull();
  // The tile's own fullscreen (participant-tile.tsx) replaces the document as the fullscreen element.
  setFullscreen(screen.getByTestId('people'));
  expect(controller.layout.maximizedPaneId).toBe(maximized);
  expect(document.documentElement.hasAttribute('data-stage-fullscreen')).toBe(
    true
  );
  // Back from the tile to the document, then out: the saved state is restored once.
  setFullscreen(document.documentElement);
  setFullscreen(null);
  expect(controller.layout.maximizedPaneId).toBe(before);
});

it('ignores a tile fullscreen that the stage did not start', () => {
  view();
  open('a');
  fireEvent.click(screen.getByRole('button', { name: 'Maximize a' }));
  const maximized = controller.layout.maximizedPaneId;
  setFullscreen(screen.getByTestId('people'));
  setFullscreen(null);
  expect(controller.layout.maximizedPaneId).toBe(maximized);
  expect(document.documentElement.hasAttribute('data-stage-fullscreen')).toBe(
    false
  );
});

it('toggles fullscreen with Shift+Alt+Enter, even from inside an editor field', () => {
  view();
  open('a');
  const field = screen.getByLabelText('a input');
  field.focus();
  fireEvent.keyDown(field, { key: 'Enter', shiftKey: true });
  expect(request).not.toHaveBeenCalled();
  fireEvent.keyDown(field, {
    key: 'Enter',
    shiftKey: true,
    altKey: true,
    repeat: true,
  });
  expect(request).not.toHaveBeenCalled();
  fireEvent.keyDown(field, {
    key: 'Enter',
    shiftKey: true,
    altKey: true,
    isComposing: true,
  });
  expect(request).not.toHaveBeenCalled();
  fireEvent.keyDown(field, { key: 'Enter', shiftKey: true, altKey: true });
  expect(request).toHaveBeenCalledTimes(1);
});

it('ends fullscreen when the layout can no longer be maximized', () => {
  const { rerender } = view();
  open('a');
  fireEvent.click(screen.getByRole('button', { name: 'Full screen a' }));
  setFullscreen(document.documentElement);
  expect(exit).not.toHaveBeenCalled();
  rerender(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Harness tier="phone" />
    </NextIntlClientProvider>
  );
  expect(exit).toHaveBeenCalledTimes(1);
});

it('offers no fullscreen where the browser or the layout cannot', () => {
  Object.defineProperty(document, 'fullscreenEnabled', {
    configurable: true,
    get: () => false,
  });
  view();
  open('a');
  expect(screen.queryByRole('button', { name: /^Full screen/ })).toBeNull();
  expect(screen.getByRole('button', { name: 'Maximize a' })).toBeTruthy();
  cleanup();
  Object.defineProperty(document, 'fullscreenEnabled', {
    configurable: true,
    get: () => true,
  });
  view('phone');
  open('a');
  expect(screen.queryByRole('button', { name: /^Full screen/ })).toBeNull();
});

it('names fullscreen in Vietnamese', () => {
  const stage = vi_messages.meet.call.stage_layout;
  expect(stage.fullscreen).toBe('Toàn màn hình {title}');
  expect(stage.exit_fullscreen).toBe('Thoát toàn màn hình {title}');
});

it('leaves fullscreen when the stage unmounts, so the browser is not left fullscreen without the call', async () => {
  const { unmount } = view();
  open('a');
  fireEvent.click(screen.getByRole('button', { name: 'Full screen a' }));
  setFullscreen(document.documentElement);
  expect(document.documentElement.hasAttribute('data-stage-fullscreen')).toBe(
    true
  );
  unmount();
  expect(document.documentElement.hasAttribute('data-stage-fullscreen')).toBe(
    false
  );
  await waitFor(() => expect(exit).toHaveBeenCalledTimes(1));
  expect(stack).toEqual([]);
});

it('does not touch fullscreen on unmount when the stage did not start it', () => {
  const { unmount } = view();
  open('a');
  setFullscreen(screen.getByTestId('people'));
  unmount();
  expect(exit).not.toHaveBeenCalled();
});

it('exits every nested fullscreen, so a tile does not keep the document fullscreen', async () => {
  const { rerender } = view();
  open('a');
  fireEvent.click(screen.getByRole('button', { name: 'Full screen a' }));
  setFullscreen(document.documentElement);
  pushFullscreen(screen.getByTestId('people'));
  expect(stack).toHaveLength(2);
  rerender(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Harness tier="phone" />
    </NextIntlClientProvider>
  );
  await waitFor(() => expect(stack).toEqual([]));
  expect(exit).toHaveBeenCalledTimes(2);
});

it('stops exiting if the browser refuses, instead of looping forever', async () => {
  const { rerender } = view();
  open('a');
  fireEvent.click(screen.getByRole('button', { name: 'Full screen a' }));
  setFullscreen(document.documentElement);
  exit.mockImplementationOnce(() =>
    Promise.reject(new TypeError('not allowed'))
  );
  rerender(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Harness tier="phone" />
    </NextIntlClientProvider>
  );
  await waitFor(() => expect(exit).toHaveBeenCalledTimes(1));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(exit).toHaveBeenCalledTimes(1);
});
