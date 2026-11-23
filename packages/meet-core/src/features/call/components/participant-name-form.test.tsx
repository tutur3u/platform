// @vitest-environment jsdom
import {
  act,
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NAME_CHECK_START_TIMEOUT_MS } from './participant-name-check';
import { ParticipantNameForm } from './participant-name-form';

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
    push: vi.fn(),
    refresh: vi.fn(),
    update: vi.fn(),
    /** What the page handed the widget last; the SDK may call these late. */
    widget: null as null | {
      onSuccess: (token: string) => void;
      options: { size?: string };
      scriptOptions: { onError: () => void };
    },
  };
});
vi.mock('@tuturuuu/internal-api', () => ({
  InternalApiError: mocks.InternalApiError,
  updateCurrentUserProfile: mocks.update,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock('@marsidev/react-turnstile', () => ({
  DEFAULT_SCRIPT_ID: 'cf-turnstile-script',
  Turnstile: ({
    onError,
    onSuccess,
    onUnsupported,
    onWidgetLoad,
    options,
    scriptOptions,
  }: {
    onError: () => void;
    onSuccess: (token: string) => void;
    onUnsupported: () => void;
    onWidgetLoad: (id: string) => void;
    options: { size?: string };
    scriptOptions: { onError: () => void };
  }) => {
    mocks.widget = { onSuccess, options, scriptOptions };
    return (
      <div data-testid="browser-check">
        <button type="button" onClick={() => onWidgetLoad('widget')}>
          show check
        </button>
        <button type="button" onClick={() => onSuccess('one-use')}>
          pass check
        </button>
        <button
          type="button"
          onClick={() => {
            onSuccess('one-use');
            onSuccess('one-use');
          }}
        >
          pass check twice
        </button>
        <button
          type="button"
          onClick={() => {
            onSuccess('one-use');
            onError();
          }}
        >
          pass then fail check
        </button>
        <button type="button" onClick={onError}>
          fail check
        </button>
        <button type="button" onClick={() => scriptOptions.onError()}>
          block script
        </button>
        <button type="button" onClick={onUnsupported}>
          unsupported browser
        </button>
      </div>
    );
  },
}));

// The default 1s findBy/waitFor budget is shorter than a cold jsdom render on a
// loaded CI runner. Waits still resolve as soon as the condition holds.
configure({ asyncUtilTimeout: 15_000 });
vi.setConfig({ testTimeout: 30_000 });

const challenge = () =>
  new mocks.InternalApiError('Forbidden', 403, 'ABUSE_CHALLENGE_REQUIRED');
const saveButton = () =>
  screen.getByRole<HTMLButtonElement>('button', { name: 'save_name_continue' });
const submit = () => fireEvent.click(saveButton());
/**
 * findBy resolves on the DOM mutation, which can precede React's passive
 * effects. The check only reports outcomes once its mount effect has run, so
 * flush effects before pressing or the press is dropped.
 */
const press = async (name: string) => {
  const button = await screen.findByRole('button', { name });
  await act(async () => {});
  fireEvent.click(button);
};
const renderForm = (siteKey: string | undefined = 'site-key') =>
  render(
    <ParticipantNameForm
      initialName="Ada"
      leaveHref="/"
      meetingName="Standup"
      siteKey={siteKey}
    />
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockReset().mockResolvedValue({});
  mocks.widget = null;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.getElementById('cf-turnstile-script')?.remove();
});

it('saves the name and reloads the room when no check is asked for', async () => {
  renderForm();
  submit();

  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  expect(mocks.update).toHaveBeenCalledTimes(1);
  expect(mocks.update).toHaveBeenCalledWith(
    { display_name: 'Ada' },
    undefined,
    undefined
  );
  expect(screen.queryByTestId('browser-check')).toBeNull();
});

it('shows the browser check on a challenge, then saves once with its token', async () => {
  mocks.update.mockRejectedValueOnce(challenge());
  renderForm();
  expect(
    screen.getByRole('main').querySelector('[aria-live]')?.textContent
  ).toBe('');
  submit();

  await press('pass check');

  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  expect(mocks.update).toHaveBeenCalledTimes(2);
  expect(mocks.update).toHaveBeenLastCalledWith(
    { display_name: 'Ada' },
    undefined,
    { turnstileToken: 'one-use' }
  );
  expect(screen.queryByTestId('browser-check')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('announces the check in a region that was already on the page', async () => {
  mocks.update.mockRejectedValueOnce(challenge());
  renderForm();
  const region = screen.getByRole('main').querySelector('[aria-live="polite"]');
  submit();

  await screen.findByTestId('browser-check');

  expect(region?.isConnected).toBe(true);
  expect(region?.textContent).toBe('name_verify_prompt');
});

it('sends the token once when the check reports success twice', async () => {
  mocks.update.mockRejectedValueOnce(challenge());
  renderForm();
  submit();

  await press('pass check twice');

  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  expect(mocks.update).toHaveBeenCalledTimes(2);
});

it('ignores a check error that arrives while the verified save is pending', async () => {
  let finish: (value: unknown) => void = () => {};
  mocks.update
    .mockRejectedValueOnce(challenge())
    .mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
  renderForm();
  submit();

  await press('pass then fail check');

  expect(screen.queryByRole('alert')).toBeNull();
  expect(saveButton().disabled).toBe(true);
  await act(async () => finish({}));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  expect(mocks.update).toHaveBeenCalledTimes(2);
});

it('stops after one verified retry when the save is refused again', async () => {
  mocks.update.mockRejectedValue(challenge());
  renderForm();
  submit();

  await press('pass check');

  expect((await screen.findByRole('alert')).textContent).toBe(
    'name_verify_failed'
  );
  expect(mocks.update).toHaveBeenCalledTimes(2);
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(screen.queryByTestId('browser-check')).toBeNull();
});

it('reports a failed check without retrying, and the next submit starts over', async () => {
  mocks.update
    .mockRejectedValueOnce(challenge())
    .mockRejectedValueOnce(challenge());
  renderForm();
  submit();

  await press('fail check');

  expect((await screen.findByRole('alert')).textContent).toBe(
    'name_verify_failed'
  );
  expect(mocks.update).toHaveBeenCalledTimes(1);
  expect(saveButton().disabled).toBe(false);

  submit();
  await press('pass check');

  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  expect(mocks.update).toHaveBeenCalledTimes(3);
  expect(mocks.update).toHaveBeenNthCalledWith(
    2,
    { display_name: 'Ada' },
    undefined,
    undefined
  );
});

it('unlocks the form and clears the failed script when the check cannot load', async () => {
  const script = document.createElement('script');
  script.id = 'cf-turnstile-script';
  document.head.append(script);
  mocks.update.mockRejectedValueOnce(challenge());
  renderForm();
  submit();

  await press('block script');

  expect((await screen.findByRole('alert')).textContent).toBe(
    'name_verify_failed'
  );
  expect(saveButton().disabled).toBe(false);
  expect(document.getElementById('cf-turnstile-script')).toBeNull();
  expect(screen.queryByTestId('browser-check')).toBeNull();
});

it('gives up on a check that never appears, but not on one that did', async () => {
  vi.useFakeTimers();
  const settle = () => act(async () => vi.advanceTimersByTimeAsync(0));
  mocks.update.mockRejectedValue(challenge());

  renderForm();
  submit();
  await settle();
  fireEvent.click(screen.getByRole('button', { name: 'show check' }));
  await act(async () =>
    vi.advanceTimersByTimeAsync(NAME_CHECK_START_TIMEOUT_MS)
  );
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByTestId('browser-check')).toBeTruthy();
  cleanup();

  renderForm();
  submit();
  await settle();
  expect(screen.getByTestId('browser-check')).toBeTruthy();
  await act(async () =>
    vi.advanceTimersByTimeAsync(NAME_CHECK_START_TIMEOUT_MS)
  );
  expect(screen.getByRole('alert').textContent).toBe('name_verify_failed');
  expect(saveButton().disabled).toBe(false);
});

it('unlocks the form when the browser cannot run the check', async () => {
  mocks.update.mockRejectedValueOnce(challenge());
  renderForm();
  submit();

  await press('show check');
  await press('unsupported browser');

  expect((await screen.findByRole('alert')).textContent).toBe(
    'name_verify_failed'
  );
  expect(saveButton().disabled).toBe(false);
  expect(mocks.update).toHaveBeenCalledTimes(1);
});

it('saves nothing from a check that finishes after the visitor left', async () => {
  const script = document.createElement('script');
  script.id = 'cf-turnstile-script';
  document.head.append(script);
  mocks.update.mockRejectedValueOnce(challenge());
  renderForm();
  submit();
  await screen.findByTestId('browser-check');
  const left = mocks.widget;

  fireEvent.click(screen.getByRole('button', { name: 'leave' }));

  expect(mocks.push).toHaveBeenCalledWith('/');
  expect(screen.queryByTestId('browser-check')).toBeNull();
  act(() => {
    left?.onSuccess('late');
    left?.scriptOptions.onError();
  });
  expect(mocks.update).toHaveBeenCalledTimes(1);
  expect(document.getElementById('cf-turnstile-script')).toBe(script);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('keeps one outcome per check when effects are replayed', async () => {
  mocks.update.mockRejectedValueOnce(challenge());
  render(
    <StrictMode>
      <ParticipantNameForm
        initialName="Ada"
        leaveHref="/"
        meetingName="Standup"
        siteKey="site-key"
      />
    </StrictMode>
  );
  submit();

  await press('pass check twice');

  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  expect(mocks.update).toHaveBeenCalledTimes(2);
});

it('uses the compact check where the flexible one cannot fit', async () => {
  const matchMedia = vi.fn().mockReturnValue({ matches: false });
  vi.stubGlobal('matchMedia', matchMedia);
  mocks.update.mockRejectedValueOnce(challenge());
  renderForm();
  submit();

  await screen.findByTestId('browser-check');

  expect(matchMedia).toHaveBeenCalledWith('(min-width: 24rem)');
  expect(mocks.widget?.options.size).toBe('compact');
});

it('reports the challenge when no site key is configured', async () => {
  mocks.update.mockRejectedValueOnce(challenge());
  renderForm('');
  submit();

  expect((await screen.findByRole('alert')).textContent).toBe(
    'name_verify_failed'
  );
  expect(screen.queryByTestId('browser-check')).toBeNull();
  expect(mocks.update).toHaveBeenCalledTimes(1);
});

it('keeps the plain save error for any other failure', async () => {
  mocks.update.mockRejectedValueOnce(
    new mocks.InternalApiError('Server error', 500)
  );
  renderForm();
  submit();

  expect((await screen.findByRole('alert')).textContent).toBe(
    'name_save_failed'
  );
  expect(screen.queryByTestId('browser-check')).toBeNull();
});
