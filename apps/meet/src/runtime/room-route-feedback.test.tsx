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
import { roomFeedbackMessages } from './room-feedback-messages';
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
  vi.clearAllMocks();
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
    expect(screen.getByText(copy.join_missing_hint)).toBeTruthy();
    expect(screen.getByText(copy.preparing_privacy)).toBeTruthy();
    expect(screen.getByText(copy.resource_limits_hint)).toBeTruthy();
    view.rerender(
      <RoomRouteFeedback pathname={pathname} state="error" onRetry={retry} />
    );
    fireEvent.click(
      screen.getByRole('button', { name: copy.connection_refresh })
    );
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByText(copy.join_error_hint)).toBeTruthy();
  }
);

it.each(['en', 'vi'] as const)(
  'uses native room entrypoints for bounded recovery in %s',
  async (locale) => {
    route.pathname = locale === 'vi' ? '/vi/r/code' : '/r/code';
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const copy = (locale === 'vi' ? vietnamese : en).meet.call;
    const view = render(<Pending />);
    expect(
      screen.getByRole('heading', { name: copy.preparing_call })
    ).toBeTruthy();
    expect(screen.getByText(copy.preparing_call_hint)).toBeTruthy();
    act(() => vi.advanceTimersByTime(30_000));
    expect(
      screen.getByRole('heading', { name: copy.join_loading_slow_title })
    ).toBeTruthy();
    expect(screen.getByText(copy.join_loading_slow_hint)).toBeTruthy();
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
  }
);

it.each([
  ['en', en],
  ['vi', vietnamese],
] as const)(
  'keeps the room feedback subset aligned with %s messages',
  (locale, full) => {
    expect(full.meet.call).toMatchObject(
      roomFeedbackMessages[locale].meet.call
    );
  }
);
