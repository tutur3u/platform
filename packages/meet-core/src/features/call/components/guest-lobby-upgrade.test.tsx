// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { GuestLobbyUpgrade } from './guest-lobby-upgrade';
import { GuestVerificationProvider } from './guest-verification-context';

const mocks = vi.hoisted(() => ({
  join: vi.fn(),
  widget: null as null | {
    onToken: (token: string) => void;
    onHumanPass: (token: string) => void;
  },
}));
vi.mock('@tuturuuu/internal-api/meet-call', () => ({
  joinMeetCallAsGuest: mocks.join,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('./guest-turnstile', () => ({
  GuestTurnstile: (props: typeof mocks.widget) => {
    mocks.widget = props;
    return <div data-testid="widget" />;
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const meetingId = '7f2a528e-3bff-40ee-bfda-5b944ad03ed8';

function setup(verified = false) {
  const room = { renewSession: vi.fn() };
  render(
    <GuestVerificationProvider
      value={{ meetingId, siteKey: 'site-key', verified }}
    >
      <GuestLobbyUpgrade room={room} displayName="Lan" />
    </GuestVerificationProvider>
  );
  return room;
}

it('upgrades the waiting guest with a Turnstile token and reconnects', async () => {
  mocks.join.mockResolvedValue({ ok: true });
  const room = setup();
  act(() => mocks.widget?.onToken('token-1'));
  await waitFor(() => expect(room.renewSession).toHaveBeenCalledOnce());
  expect(mocks.join).toHaveBeenCalledWith(meetingId, {
    displayName: 'Lan',
    turnstileToken: 'token-1',
  });
  expect(screen.getByText('lobby_upgrade_done')).toBeTruthy();
});

it('upgrades with a puzzle pass', async () => {
  mocks.join.mockResolvedValue({ ok: true });
  const room = setup();
  act(() => mocks.widget?.onHumanPass('pass-1'));
  await waitFor(() => expect(room.renewSession).toHaveBeenCalledOnce());
  expect(mocks.join).toHaveBeenCalledWith(meetingId, {
    displayName: 'Lan',
    humanPassToken: 'pass-1',
  });
});

it('keeps the guest waiting and offers a fresh check when the upgrade fails', async () => {
  mocks.join.mockRejectedValue(new Error('403'));
  const room = setup();
  act(() => mocks.widget?.onToken('token-1'));
  await waitFor(() => expect(screen.getByText('error_turnstile')).toBeTruthy());
  expect(room.renewSession).not.toHaveBeenCalled();
  expect(screen.getByTestId('widget')).toBeTruthy();
});

it('renders nothing for a verified or signed-in participant', () => {
  setup(true);
  expect(screen.queryByTestId('guest-lobby-upgrade')).toBeNull();
  cleanup();
  render(
    <GuestLobbyUpgrade room={{ renewSession: vi.fn() }} displayName="Lan" />
  );
  expect(screen.queryByTestId('guest-lobby-upgrade')).toBeNull();
});
