import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type {
  DesktopVaultState,
  DesktopVaultVersion,
} from '@tuturuuu/internal-api/infrastructure';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  state: vi.fn(),
  mutate: vi.fn(),
  upload: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/infrastructure', () => ({
  getDesktopVaultState: mock.state,
  mutateDesktopVault: mock.mutate,
  uploadDesktopVaultFile: mock.upload,
}));
vi.mock('next-intl', () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, unknown>) =>
        values?.platform ? `${key} ${values.platform}` : key,
      { has: () => true }
    ),
}));

import { DesktopVaultClient } from './desktop-vault-client';

const draft: DesktopVaultVersion = {
  id: 'draft',
  platform: 'windows',
  version: 2,
  status: 'draft',
  revision: 7,
  validatedRevision: null,
  validationErrors: ['not_validated'],
  createdAt: '2026-10-06T00:00:00Z',
  resources: ['WINDOWS_SIGNING_CERTIFICATE_PASSWORD'],
};
const state: DesktopVaultState = {
  deliveryEnabled: false,
  platforms: [
    { platform: 'windows', enabled: false, activeVersionId: 'active' },
    { platform: 'macos', enabled: false, activeVersionId: null },
  ],
  versions: [
    draft,
    {
      ...draft,
      id: 'active',
      version: 1,
      status: 'active',
      validatedRevision: 7,
      validationErrors: [],
    },
  ],
  tokens: [],
};
function mount(
  actorId = 'alice',
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
) {
  const view = render(
    <QueryClientProvider client={client}>
      <DesktopVaultClient actorId={actorId} />
    </QueryClientProvider>
  );
  return {
    ...view,
    client,
    actor: (id: string) =>
      view.rerender(
        <QueryClientProvider client={client}>
          <DesktopVaultClient actorId={id} />
        </QueryClientProvider>
      ),
  };
}
function expectPrivateCacheEmpty(client: QueryClient) {
  for (const mutation of client.getMutationCache().getAll()) {
    expect(mutation.state.variables).toBeUndefined();
    expect(mutation.state.data).toBeUndefined();
    if (mutation.state.error)
      expect(mutation.state.error.message).toBe('Desktop operation rejected');
  }
}
beforeEach(() => {
  vi.resetAllMocks();
  mock.state.mockResolvedValue(state);
  mock.mutate.mockResolvedValue({ state });
  mock.upload.mockResolvedValue({ state });
});

describe('private desktop signing operator workflow', () => {
  it('shows only configured names with empty credential inputs and no delivery enable control', async () => {
    mount();
    const password = await screen.findByLabelText(
      'resources.WINDOWS_SIGNING_CERTIFICATE_PASSWORD'
    );
    expect(password).toHaveValue('');
    expect(password).toHaveAttribute('type', 'password');
    expect(screen.getAllByText('vault.deliveryDisabled')).toHaveLength(2);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText('PRIVATE SAVED VALUE')).not.toBeInTheDocument();
  });
  it('sends the current expected revision and clears an edited scalar after successful save', async () => {
    mount();
    const password = await screen.findByLabelText(
      'resources.WINDOWS_SIGNING_CERTIFICATE_PASSWORD'
    );
    fireEvent.change(password, { target: { value: 'synthetic replacement' } });
    fireEvent.click(
      within(password.closest('form')!).getByRole('button', { name: 'save' })
    );
    await waitFor(() =>
      expect(mock.mutate).toHaveBeenCalledWith({
        action: 'save_scalar',
        versionId: 'draft',
        revision: 7,
        name: 'WINDOWS_SIGNING_CERTIFICATE_PASSWORD',
        value: 'synthetic replacement',
      })
    );
    await waitFor(() => expect(password).toHaveValue(''));
  });
  it('does not enable activation for a validation receipt from an older revision', async () => {
    mock.state.mockResolvedValue({
      ...state,
      versions: [{ ...draft, validatedRevision: 6, validationErrors: [] }],
    });
    mount();
    expect(
      await screen.findByRole('button', { name: 'vault.activate' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'vault.validate' })
    ).toBeEnabled();
  });
  it('uses shared multipart client uploads and the current version revision', async () => {
    mount();
    const input = await screen.findByLabelText(
      'resources.windows_authenticode_certificate_pfx'
    );
    const file = new File(['synthetic pfx'], 'fixture.pfx');
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(
      within(input.closest('form')!).getByRole('button', { name: 'save' })
    );
    await waitFor(() =>
      expect(mock.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          versionId: 'draft',
          revision: 7,
          name: 'windows_authenticode_certificate_pfx',
          file,
        })
      )
    );
  });
  it('rejects oversized files before any network write', async () => {
    mount();
    const input = await screen.findByLabelText(
      'resources.windows_authenticode_certificate_pfx'
    );
    fireEvent.change(input, {
      target: { files: [new File([new Uint8Array(2097153)], 'too-large.pfx')] },
    });
    fireEvent.click(
      within(input.closest('form')!).getByRole('button', { name: 'save' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'operationFailed'
    );
    expect(mock.upload).not.toHaveBeenCalled();
  });
  it('refreshes stale metadata on conflict while retaining the operator replacement for retry', async () => {
    const view = mount();
    const password = await screen.findByLabelText(
      'resources.WINDOWS_SIGNING_CERTIFICATE_PASSWORD'
    );
    const invalidate = vi.spyOn(view.client, 'invalidateQueries');
    mock.mutate.mockRejectedValue({
      status: 409,
      message: 'private backend detail',
    });
    fireEvent.change(password, { target: { value: 'synthetic replacement' } });
    fireEvent.click(
      within(password.closest('form')!).getByRole('button', { name: 'save' })
    );
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ['desktop-signing-vault', 'alice'],
      })
    );
    expect(password).toHaveValue('synthetic replacement');
    expectPrivateCacheEmpty(view.client);
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      'private backend detail'
    );
  });
  it('hides retained state on a definitive access denial', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(['desktop-signing-vault', 'alice'], state);
    mock.state.mockRejectedValue({ status: 403 });
    mount('alice', client);
    expect(await screen.findByRole('alert')).toHaveTextContent('accessDenied');
    expect(
      screen.queryByLabelText('resources.WINDOWS_SIGNING_CERTIFICATE_PASSWORD')
    ).not.toBeInTheDocument();
  });
  it('destroys credential inputs on actor changes and rejects late old-actor token publication', async () => {
    let finish!: (result: { state: DesktopVaultState; token: string }) => void;
    mock.mutate.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const view = mount();
    const password = await screen.findByLabelText(
      'resources.WINDOWS_SIGNING_CERTIFICATE_PASSWORD'
    );
    fireEvent.change(password, { target: { value: 'alice synthetic input' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'issueToken platforms.windows' })
    );
    await waitFor(() => expect(mock.mutate).toHaveBeenCalledOnce());
    mock.state.mockResolvedValue({ ...state, tokens: [] });
    view.actor('bob');
    expect(
      await screen.findByLabelText(
        'resources.WINDOWS_SIGNING_CERTIFICATE_PASSWORD'
      )
    ).toHaveValue('');
    finish({ state, token: 'synthetic-alice-token' });
    await waitFor(() => expect(view.client.isMutating()).toBe(0));
    expect(
      screen.queryByDisplayValue('synthetic-alice-token')
    ).not.toBeInTheDocument();
    expectPrivateCacheEmpty(view.client);
    expect(view.client.getQueryData(['desktop-signing-vault', 'bob'])).toEqual(
      state
    );
  });
  it('shows a token once, masks it by default and removes it on dismissal', async () => {
    mock.mutate.mockResolvedValue({ state, token: 'synthetic-token' });
    const view = mount();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'issueToken platforms.windows',
      })
    );
    const token = await screen.findByDisplayValue('synthetic-token');
    expectPrivateCacheEmpty(view.client);
    expect(token).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'dismissToken' }));
    expect(
      screen.queryByDisplayValue('synthetic-token')
    ).not.toBeInTheDocument();
    expectPrivateCacheEmpty(view.client);
  });
  it('keeps pending scalar inputs out of mutation variables across logout and delayed completion', async () => {
    let finish!: (value: { state: DesktopVaultState }) => void;
    mock.mutate.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const view = mount();
    const password = await screen.findByLabelText(
      'resources.WINDOWS_SIGNING_CERTIFICATE_PASSWORD'
    );
    fireEvent.change(password, {
      target: { value: 'private synthetic scalar' },
    });
    fireEvent.click(
      within(password.closest('form')!).getByRole('button', { name: 'save' })
    );
    await waitFor(() => expect(mock.mutate).toHaveBeenCalledOnce());
    expectPrivateCacheEmpty(view.client);
    view.unmount();
    finish({ state });
    await waitFor(() => expect(view.client.isMutating()).toBe(0));
    expectPrivateCacheEmpty(view.client);
  });
  it('keeps pending file inputs out of the shared mutation cache', async () => {
    let finish!: (value: { state: DesktopVaultState }) => void;
    mock.upload.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const view = mount();
    const input = await screen.findByLabelText(
      'resources.windows_authenticode_certificate_pfx'
    );
    fireEvent.change(input, {
      target: { files: [new File(['synthetic private file'], 'test.pfx')] },
    });
    fireEvent.click(
      within(input.closest('form')!).getByRole('button', { name: 'save' })
    );
    await waitFor(() => expect(mock.upload).toHaveBeenCalledOnce());
    expectPrivateCacheEmpty(view.client);
    finish({ state });
    await waitFor(() => expect(view.client.isMutating()).toBe(0));
    expectPrivateCacheEmpty(view.client);
  });
  it('does not publish a delayed first Alice result into a remounted Alice session', async () => {
    let finish!: (result: { state: DesktopVaultState; token: string }) => void;
    mock.mutate.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const view = mount();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'issueToken platforms.windows',
      })
    );
    await waitFor(() => expect(mock.mutate).toHaveBeenCalledOnce());
    const fresh = { ...state, versions: [{ ...draft, revision: 9 }] };
    mock.state.mockResolvedValue(fresh);
    view.actor('bob');
    await waitFor(() =>
      expect(
        view.client.getQueryData(['desktop-signing-vault', 'bob'])
      ).toEqual(fresh)
    );
    view.actor('alice');
    await waitFor(() =>
      expect(
        view.client.getQueryData(['desktop-signing-vault', 'alice'])
      ).toEqual(fresh)
    );
    finish({ state, token: 'old-alice-private-token' });
    await waitFor(() => expect(view.client.isMutating()).toBe(0));
    expect(
      view.client.getQueryData(['desktop-signing-vault', 'alice'])
    ).toEqual(fresh);
    expect(
      screen.queryByDisplayValue('old-alice-private-token')
    ).not.toBeInTheDocument();
    expectPrivateCacheEmpty(view.client);
  });
  it('collects only the unobserved private mutation after a delayed failure on logout', async () => {
    let fail!: (error: unknown) => void;
    mock.mutate.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        })
    );
    const view = mount();
    const unrelated = view.client
      .getMutationCache()
      .build(view.client, { mutationKey: ['unrelated'], gcTime: Infinity });
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'issueToken platforms.windows',
      })
    );
    await waitFor(() => expect(mock.mutate).toHaveBeenCalledOnce());
    view.unmount();
    fail({
      status: 500,
      message: 'synthetic-sensitive-provider-error',
      payload: 'private',
    });
    await waitFor(() =>
      expect(view.client.getMutationCache().getAll()).toEqual([unrelated])
    );
    expect(view.client.isMutating()).toBe(0);
  });
});
