// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
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

let entered = false;
const request = vi.fn(() => {
  entered = true;
  return Promise.resolve();
});
const exit = vi.fn(() => Promise.resolve());
// The element that asked for fullscreen, while the browser is in it.
const fullscreenOwner = () =>
  entered ? (request.mock.contexts.at(-1) as Element) : null;
const setFullscreen = (on: boolean) =>
  act(() => {
    entered = on;
    document.dispatchEvent(new Event('fullscreenchange'));
  });
beforeEach(() => {
  entered = false;
  request.mockClear();
  exit.mockClear();
  Object.defineProperty(document, 'fullscreenEnabled', {
    configurable: true,
    get: () => true,
  });
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: fullscreenOwner,
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

it('goes truly fullscreen on the stage and restores the maximize state on exit', () => {
  view();
  open('a', 'b');
  expect(controller.layout.maximizedPaneId).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Full screen a' }));
  expect(request).toHaveBeenCalledTimes(1);
  expect(controller.layout.maximizedPaneId).not.toBeNull();
  expect(fullscreenOwner()?.contains(screen.getByTestId('people'))).toBe(true);
  setFullscreen(true);
  const exitButton = screen.getByRole('button', { name: 'Exit full screen a' });
  expect(exitButton.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(exitButton);
  expect(exit).toHaveBeenCalledTimes(1);
  // The browser's Esc and the toggle both end in the same event.
  setFullscreen(false);
  expect(controller.layout.maximizedPaneId).toBeNull();
  expect(screen.getByRole('button', { name: 'Full screen a' })).toBeTruthy();
});

it('keeps an existing maximize when fullscreen ends', () => {
  view();
  open('a', 'b');
  fireEvent.click(screen.getAllByRole('button', { name: /^Maximize/ })[0]!);
  const maximized = controller.layout.maximizedPaneId;
  expect(maximized).not.toBeNull();
  fireEvent.click(screen.getAllByRole('button', { name: /^Full screen/ })[0]!);
  setFullscreen(true);
  setFullscreen(false);
  expect(controller.layout.maximizedPaneId).toBe(maximized);
});

it('toggles fullscreen with Shift+Alt+Enter, even from inside an editor field', () => {
  view();
  open('a');
  const field = screen.getByLabelText('a input');
  field.focus();
  fireEvent.keyDown(field, { key: 'Enter', shiftKey: true });
  expect(request).not.toHaveBeenCalled();
  fireEvent.keyDown(field, { key: 'Enter', shiftKey: true, altKey: true });
  expect(request).toHaveBeenCalledTimes(1);
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
