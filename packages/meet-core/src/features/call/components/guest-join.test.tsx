// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  forgetMiraJoinChoice,
  peekMiraJoinChoice,
} from '../../live-assistant/mira-join-choice';
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
    puzzle: vi.fn(),
    check: vi.fn(),
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
vi.mock('@tuturuuu/internal-api/meet-guest-human-check', () => ({
  createMeetGuestHumanCheck: mocks.puzzle,
  verifyMeetGuestHumanCheck: mocks.check,
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
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
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
  // The Mira checkbox sits inside the form, where Radix observes its size.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  mocks.mounts = 0;
  mocks.widget = null;
  mocks.join.mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

it('(d) still joins when the Mira box cannot be stored', async () => {
  const setItem = vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw new Error('private mode');
    });
  try {
    setup();
    act(() => widget().onSuccess('one-use'));
    fireEvent.click(screen.getByRole('button', { name: 'ask_to_join' }));
    await waitFor(() =>
      expect(mocks.join).toHaveBeenCalledWith(expect.any(String), {
        displayName: 'Safari guest',
        turnstileToken: 'one-use',
      })
    );
  } finally {
    setItem.mockRestore();
  }
});

it('starts the Mira box unticked and keeps the revision seen on the page', async () => {
  const meetingId = '7f2a528e-3bff-40ee-bfda-5b944ad03ed8';
  forgetMiraJoinChoice(meetingId);
  render(
    <MeetGuestJoin
      meetingId={meetingId}
      returnTo="/r/abc"
      siteKey="site-key"
      miraAcceptanceRevision={4}
    />
  );
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'Safari guest' },
  });
  const box = screen.getByRole('checkbox');
  expect(box.getAttribute('aria-checked')).toBe('false');
  act(() => widget().onSuccess('one-use'));
  fireEvent.click(screen.getByRole('button', { name: 'ask_to_join' }));
  await waitFor(() => expect(mocks.join).toHaveBeenCalled());
  await waitFor(() =>
    expect(peekMiraJoinChoice(meetingId)).toMatchObject({
      ticked: false,
      seenRevision: 4,
    })
  );
  forgetMiraJoinChoice(meetingId);
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
  await act(async () => {
    vi.advanceTimersByTime(4000);
  });
  expect(mocks.mounts).toBe(4);
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

it('offers the Tuturuuu puzzle when Turnstile cannot run and joins with its pass', async () => {
  mocks.puzzle.mockResolvedValue({
    token: 'sealed',
    background: 'data:image/png;base64,AA==',
    piece: 'data:image/png;base64,AA==',
    pieceY: 30,
    width: 320,
    height: 160,
    pieceSize: 54,
    expiresAt: Date.now() + 120_000,
  });
  mocks.check.mockResolvedValue({
    ok: true,
    passToken: 'human-pass',
    expiresAt: 0,
  });
  setup();
  await act(async () => {
    vi.advanceTimersByTime(GUEST_TURNSTILE_WATCHDOG_MS);
  });
  fireEvent.click(screen.getByRole('button', { name: 'puzzle_start' }));
  const slider = await screen.findByRole('slider', { name: 'puzzle_slider' });
  fireEvent.keyDown(slider, { key: 'ArrowRight', shiftKey: true });
  fireEvent.keyDown(slider, { key: 'Enter' });
  await waitFor(() => expect(screen.getByText('puzzle_passed')).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'ask_to_join' }));
  await waitFor(() =>
    expect(mocks.join).toHaveBeenCalledWith(expect.any(String), {
      displayName: 'Safari guest',
      humanPassToken: 'human-pass',
    })
  );
});

it('keeps the puzzle available once Turnstile is unsupported', () => {
  setup();
  act(() => widget().onUnsupported());
  expect(screen.getByRole('button', { name: 'puzzle_start' })).toBeTruthy();
});

it('keeps a name typed before hydration', async () => {
  const props = {
    meetingId: '7f2a528e-3bff-40ee-bfda-5b944ad03ed8',
    returnTo: '/r/abc',
    siteKey: 'site-key',
  };
  const host = document.createElement('div');
  host.innerHTML = renderToString(<MeetGuestJoin {...props} />);
  document.body.append(host);
  const input = host.querySelector('input') as HTMLInputElement;
  input.value = 'Fast typer';
  await act(async () => {
    hydrateRoot(host, <MeetGuestJoin {...props} />);
  });
  expect(input.value).toBe('Fast typer');
  expect(
    screen.getByRole('button', { name: 'ask_host_without_verification' })
  ).toHaveProperty('disabled', false);
  host.remove();
});

it('server-renders the Turnstile script under the CSP nonce', () => {
  const html = renderToString(
    <MeetGuestJoin
      meetingId="7f2a528e-3bff-40ee-bfda-5b944ad03ed8"
      returnTo="/r/abc"
      siteKey="site-key"
      scriptNonce="nonce-123"
    />
  );
  expect(html).toContain('nonce="nonce-123"');
  expect(html).toContain(
    'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback&amp;render=explicit'
  );
});

it('hydrates the server-rendered early script without replacing the form', async () => {
  const props = {
    meetingId: '7f2a528e-3bff-40ee-bfda-5b944ad03ed8',
    returnTo: '/r/abc',
    siteKey: 'site-key',
  };
  const host = document.createElement('div');
  host.innerHTML = renderToString(
    <MeetGuestJoin {...props} scriptNonce="n-1" />
  );
  document.body.append(host);
  const input = host.querySelector('input') as HTMLInputElement;
  const recoverable = vi.fn();
  await act(async () => {
    hydrateRoot(host, <MeetGuestJoin {...props} />, {
      onRecoverableError: recoverable,
    });
  });
  expect(recoverable).not.toHaveBeenCalled();
  expect(host.querySelector('input')).toBe(input);
  host.remove();
});
