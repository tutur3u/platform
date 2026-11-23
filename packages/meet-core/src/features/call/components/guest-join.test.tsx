// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GUEST_TURNSTILE_WATCHDOG_MS } from '../lib/guest-turnstile-recovery';
import { guestJoinFailure, MeetGuestJoin } from './guest-join';

type WidgetProps = {
  onSuccess: (token: string) => void;
  onError: (code?: string) => boolean | undefined;
  onTimeout: () => void;
  onUnsupported: () => void;
  onBeforeInteractive: () => void;
  scriptOptions?: { onError?: () => void };
};

const mocks = vi.hoisted(() => {
  class InternalApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly code?: string
    ) {
      super(message);
    }
  }
  return {
    InternalApiError,
    join: vi.fn(),
    refresh: vi.fn(),
    mounts: 0,
    widget: null as WidgetProps | null,
  };
});
vi.mock('@tuturuuu/internal-api', () => ({
  InternalApiError: mocks.InternalApiError,
}));
vi.mock('@tuturuuu/internal-api/meet-call', () => ({
  joinMeetCallAsGuest: mocks.join,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@marsidev/react-turnstile', async () => {
  const { useEffect } = await import('react');
  return {
    Turnstile: (props: WidgetProps) => {
      mocks.widget = props;
      useEffect(() => {
        mocks.mounts += 1;
      }, []);
      return <div data-testid="turnstile-widget" />;
    },
  };
});

function setup() {
  render(
    <MeetGuestJoin
      meetingId="7f2a528e-3bff-40ee-bfda-5b944ad03ed8"
      returnTo="/r/abc"
      siteKey="site-key"
    />
  );
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'Safari guest' },
  });
}

const widget = () => {
  if (!mocks.widget) throw new Error('widget not rendered');
  return mocks.widget;
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mocks.mounts = 0;
  mocks.widget = null;
  mocks.join.mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

it('joins with the Turnstile token once the check passes', async () => {
  setup();
  const ask = screen.getByRole('button', { name: 'ask_to_join' });
  expect(ask).toHaveProperty('disabled', true);
  act(() => widget().onSuccess('one-use'));
  expect(ask).toHaveProperty('disabled', false);
  fireEvent.click(ask);
  await waitFor(() =>
    expect(mocks.join).toHaveBeenCalledWith(expect.any(String), {
      displayName: 'Safari guest',
      turnstileToken: 'one-use',
    })
  );
});

it('offers the host at once and explains a slow check after the watchdog without replacing the widget', async () => {
  setup();
  const askHost = screen.getByRole('button', {
    name: 'ask_host_without_verification',
  });
  expect(askHost).toHaveProperty('disabled', false);
  expect(screen.queryByTestId('guest-turnstile-slow')).toBeNull();
  await act(async () => {
    vi.advanceTimersByTime(GUEST_TURNSTILE_WATCHDOG_MS);
  });
  expect(screen.getByTestId('guest-turnstile-slow')).toBeTruthy();
  expect(screen.getByText('verification_blocked_hint')).toBeTruthy();
  expect(mocks.mounts).toBe(1);

  fireEvent.click(askHost);
  await waitFor(() =>
    expect(mocks.join).toHaveBeenCalledWith(expect.any(String), {
      displayName: 'Safari guest',
      hostApproval: true,
    })
  );

  fireEvent.click(screen.getByRole('button', { name: 'verification_retry' }));
  expect(mocks.mounts).toBe(2);
  expect(screen.queryByTestId('guest-turnstile-slow')).toBeNull();
});

it('hides the slow notice once a token arrives', async () => {
  setup();
  await act(async () => {
    vi.advanceTimersByTime(GUEST_TURNSTILE_WATCHDOG_MS);
  });
  act(() => widget().onSuccess('late-token'));
  expect(screen.queryByTestId('guest-turnstile-slow')).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'ask_host_without_verification' })
  ).toBeNull();
});

it('stalls after repeated errors and keeps the host path', async () => {
  setup();
  act(() => {
    widget().onError('600010');
  });
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
  act(() => {
    widget().onError('600010');
  });
  await act(async () => {
    vi.advanceTimersByTime(2000);
  });
  act(() => {
    widget().onError('600010');
  });
  expect(screen.getByTestId('guest-turnstile-stalled')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'ask_host_without_verification' })
  ).toBeTruthy();
});

it('treats a Turnstile error as handled and retries with a fresh widget', async () => {
  setup();
  let handled: boolean | undefined;
  act(() => {
    handled = widget().onError('600010');
  });
  expect(handled).toBe(true);
  expect(mocks.mounts).toBe(1);
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
  expect(mocks.mounts).toBe(2);
});

it('falls back at once on an unsupported browser', () => {
  setup();
  act(() => widget().onUnsupported());
  expect(screen.getByText('verification_unsupported_hint')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'ask_host_without_verification' })
  ).toBeTruthy();
});

it('retries when the Turnstile script fails to load', async () => {
  setup();
  act(() => widget().scriptOptions?.onError?.());
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
  expect(mocks.mounts).toBe(2);
});

it('keeps an interactive challenge on screen past the watchdog', async () => {
  setup();
  act(() => widget().onBeforeInteractive());
  await act(async () => {
    vi.advanceTimersByTime(GUEST_TURNSTILE_WATCHDOG_MS * 3);
  });
  expect(mocks.mounts).toBe(1);
  expect(screen.getByTestId('turnstile-widget')).toBeTruthy();
  expect(screen.queryByTestId('guest-turnstile-stalled')).toBeNull();
});

it('maps the verification-required refusal', () => {
  expect(
    guestJoinFailure(
      new mocks.InternalApiError('x', 403, 'MEET_GUEST_VERIFICATION_REQUIRED')
    )
  ).toBe('verification_required');
});
