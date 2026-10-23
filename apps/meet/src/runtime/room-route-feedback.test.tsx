// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import vietnamese from '../../messages/vi.json';
import { isRoomPath, RoomRouteFeedback } from './room-route-feedback';

const route = vi.hoisted(() => ({
  pathname: '/vi/r/code',
  invalidate: vi.fn(async () => {}),
}));
vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof import('@tanstack/react-router')>()),
  useLocation: () => route.pathname,
  useRouter: () => ({ invalidate: route.invalidate }),
}));
vi.mock('./app-providers', () => ({
  AppProviders: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@tuturuuu/ui/custom/app-error-boundary', () => ({
  AppErrorBoundary: () => <span>generic error</span>,
}));

import { ErrorPage, NotFoundPage, Pending } from './router-shell';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it.each(['/r/code', '/vi/r/code', '/en/r/code/'])(
  'recognizes room path %s',
  (path) => expect(isRoomPath(path)).toBe(true)
);
it.each(['/', '/personal/meetings', '/r/code/preview'])(
  'keeps unrelated route %s unchanged',
  (path) => expect(isRoomPath(path)).toBe(false)
);
it.each(['en', 'vi'] as const)(
  'renders missing room and error recovery in %s',
  (locale) => {
    const pathname = locale === 'vi' ? '/vi/r/code' : '/r/code';
    const copy = (locale === 'vi' ? vietnamese : en).meet.call;
    const retry = vi.fn();
    const view = render(
      <RoomRouteFeedback pathname={pathname} state="missing" />
    );
    expect(
      screen.getByRole('heading', { name: copy.join_missing_title })
    ).toBeTruthy();
    view.rerender(
      <RoomRouteFeedback pathname={pathname} state="error" onRetry={retry} />
    );
    fireEvent.click(
      screen.getByRole('button', { name: copy.connection_refresh })
    );
    expect(retry).toHaveBeenCalledOnce();
  }
);

it('uses the actual native room entrypoints for bounded pending, missing and error states', async () => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const copy = vietnamese.meet.call;
  const view = render(<Pending />);
  act(() => vi.advanceTimersByTime(30_000));
  expect(
    screen.getByRole('heading', { name: copy.join_loading_slow_title })
  ).toBeTruthy();
  expect(screen.getByRole('link', { name: copy.back_to_meet })).toBeTruthy();
  view.rerender(<NotFoundPage />);
  expect(
    screen.getByRole('heading', { name: copy.join_missing_title })
  ).toBeTruthy();
  const reset = vi.fn();
  view.rerender(<ErrorPage error={new Error('fixture')} reset={reset} />);
  fireEvent.click(
    screen.getByRole('button', { name: copy.connection_refresh })
  );
  expect(route.invalidate).toHaveBeenCalledOnce();
  await act(async () => {});
  expect(reset).toHaveBeenCalledOnce();
});
