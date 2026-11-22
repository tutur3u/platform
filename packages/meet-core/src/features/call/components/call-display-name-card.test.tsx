// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CallDisplayNameCard } from './call-display-name-card';

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
  return { InternalApiError, update: vi.fn() };
});
vi.mock('@tuturuuu/internal-api', () => ({
  InternalApiError: mocks.InternalApiError,
  updateCurrentUserProfile: mocks.update,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@marsidev/react-turnstile', () => ({
  DEFAULT_SCRIPT_ID: 'cf-turnstile-script',
  Turnstile: ({
    onSuccess,
    onError,
  }: {
    onSuccess: (token: string) => void;
    onError: () => void;
  }) => (
    <div>
      <button type="button" onClick={() => onSuccess('one-use')}>
        pass check
      </button>
      <button type="button" onClick={onError}>
        fail check
      </button>
    </div>
  ),
}));

const challenge = () =>
  new mocks.InternalApiError('Forbidden', 403, 'ABUSE_CHALLENGE_REQUIRED');

function setup(renameSelf = vi.fn().mockResolvedValue(undefined)) {
  const previewDisplayName = vi.fn();
  const room = {
    previewDisplayName,
    renameSelf,
    state: {
      selfUserId: 'self',
      participants: { self: { userId: 'self', displayName: 'Old Name' } },
    },
  } as never;
  render(
    <CallDisplayNameCard room={room} savedName="Old Name" siteKey="site-key" />
  );
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: '  New Name ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'save' }));
  return { previewDisplayName, renameSelf };
}

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true }))
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mocks.update.mockReset();
});

it('previews locally, saves the profile, then renames for the room', async () => {
  let finishSave = () => {};
  mocks.update.mockReturnValue(
    new Promise<void>((resolve) => {
      finishSave = resolve;
    })
  );
  const { previewDisplayName, renameSelf } = setup();
  expect(previewDisplayName).toHaveBeenCalledWith('self', 'New Name');
  expect(mocks.update).toHaveBeenCalledWith(
    { display_name: 'New Name' },
    undefined,
    undefined
  );
  // The room hears nothing until the profile save succeeds.
  expect(renameSelf).not.toHaveBeenCalled();
  finishSave();
  await waitFor(() => expect(renameSelf).toHaveBeenCalledWith('New Name'));
  expect(await screen.findByText('profile_settings.renamed')).toBeDefined();
  expect(previewDisplayName).toHaveBeenCalledTimes(1);
});

it('answers the abuse challenge once before renaming', async () => {
  mocks.update.mockRejectedValueOnce(challenge()).mockResolvedValueOnce({});
  const { renameSelf } = setup();
  fireEvent.click(await screen.findByRole('button', { name: 'pass check' }));
  await waitFor(() => expect(renameSelf).toHaveBeenCalledWith('New Name'));
  expect(mocks.update).toHaveBeenCalledTimes(2);
  expect(mocks.update).toHaveBeenLastCalledWith(
    { display_name: 'New Name' },
    undefined,
    { turnstileToken: 'one-use' }
  );
});

it('rolls back the preview when the check fails, without renaming', async () => {
  mocks.update.mockRejectedValueOnce(challenge());
  const { previewDisplayName, renameSelf } = setup();
  fireEvent.click(await screen.findByRole('button', { name: 'fail check' }));
  expect(await screen.findByText('name_verify_failed')).toBeDefined();
  expect(previewDisplayName).toHaveBeenLastCalledWith('self', 'Old Name');
  expect(renameSelf).not.toHaveBeenCalled();
});

it('rolls back the preview when the profile save fails', async () => {
  mocks.update.mockRejectedValueOnce(new Error('network'));
  const { previewDisplayName, renameSelf } = setup();
  expect(await screen.findByText('name_save_failed')).toBeDefined();
  expect(previewDisplayName).toHaveBeenLastCalledWith('self', 'Old Name');
  expect(renameSelf).not.toHaveBeenCalled();
});

it('keeps the admitted name when the room locks it', async () => {
  mocks.update.mockResolvedValueOnce({});
  const { previewDisplayName } = setup(
    vi.fn().mockRejectedValue(new Error('display_name_locked'))
  );
  expect(await screen.findByText('profile_settings.locked')).toBeDefined();
  expect(previewDisplayName).toHaveBeenLastCalledWith('self', 'Old Name');
});

it('says when the room refused a rename for going too fast', async () => {
  mocks.update.mockResolvedValueOnce({});
  const { previewDisplayName } = setup(
    vi.fn().mockRejectedValue(new Error('rename_rate_limited'))
  );
  expect(
    await screen.findByText('profile_settings.rate_limited')
  ).toBeDefined();
  expect(previewDisplayName).toHaveBeenLastCalledWith('self', 'Old Name');
});
