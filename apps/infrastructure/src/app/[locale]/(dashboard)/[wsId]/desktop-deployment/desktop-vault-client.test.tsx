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
  it('shows only configured names with empty credential inputs and no automatic activation', async () => {
    mount();
    const password = await screen.findByLabelText(
      'resources.WINDOWS_SIGNING_CERTIFICATE_PASSWORD'
    );
    expect(password).toHaveValue('');
    expect(password).toHaveAttribute('type', 'password');
    expect(screen.getAllByText('vault.globalDeliveryDisabled')).toHaveLength(2);
    expect(screen.getAllByText('vault.platformDeliveryDisabled')).toHaveLength(
      2
    );
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText('PRIVATE SAVED VALUE')).not.toBeInTheDocument();
  });
  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])(
    'shows independent global=%s and platform=%s admission gates',
    async (globalEnabled, platformEnabled) => {
      mock.state.mockResolvedValue({
        ...state,
        deliveryEnabled: globalEnabled,
        platforms: [
          { ...state.platforms[0], enabled: platformEnabled },
          { ...state.platforms[1], enabled: !platformEnabled },
        ],
      });
      mount();
      const windows = within(
        await screen.findByRole('region', { name: 'platforms.windows' })
      );
      const macos = within(
        screen.getByRole('region', { name: 'platforms.macos' })
      );
      const globalKey = globalEnabled
        ? 'vault.globalDeliveryEnabled'
        : 'vault.globalDeliveryDisabled';
      const platformKey = platformEnabled
        ? 'vault.platformDeliveryEnabled'
        : 'vault.platformDeliveryDisabled';
      expect(windows.getByText(globalKey)).toBeInTheDocument();
      expect(macos.getByText(globalKey)).toBeInTheDocument();
      expect(windows.getByText(platformKey)).toBeInTheDocument();
      expect(
        macos.getByText(
          platformEnabled
            ? 'vault.platformDeliveryDisabled'
            : 'vault.platformDeliveryEnabled'
        )
      ).toBeInTheDocument();
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
      expect(
        windows.queryByRole('button', { name: 'enable' })
      ).not.toBeInTheDocument();
    }
  );
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

function admissionState(enabled = false, global = false): DesktopVaultState {
  return {
    ...state,
    deliveryEnabled: global,
    platforms: state.platforms.map((entry) => ({
      ...entry,
      revision: 8,
      enabled: entry.platform === 'windows' ? enabled : false,
    })),
  };
}
async function windowsPanel() {
  return within(
    await screen.findByRole('region', { name: 'platforms.windows' })
  );
}
async function enableWindows() {
  const panel = await windowsPanel();
  await waitFor(() =>
    expect(panel.getByRole('button', { name: 'enableDelivery' })).toBeEnabled()
  );
  fireEvent.click(panel.getByRole('button', { name: 'enableDelivery' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'confirmEnableDelivery' })
  );
}
describe('audited operator platform admission', () => {
  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])(
    'keeps global=%s independent of platform=%s control',
    async (global, enabled) => {
      mock.state.mockResolvedValue(admissionState(enabled, global));
      const view = mount();
      const panel = await windowsPanel();
      if (enabled) {
        const stop = panel.getByRole('button', { name: 'disableDelivery' });
        await waitFor(() => expect(stop).toBeEnabled());
        fireEvent.click(stop);
      } else {
        fireEvent.click(panel.getByRole('button', { name: 'enableDelivery' }));
        expect(mock.mutate).not.toHaveBeenCalled();
        fireEvent.click(
          await screen.findByRole('button', { name: 'confirmEnableDelivery' })
        );
      }
      await waitFor(() =>
        expect(mock.mutate).toHaveBeenCalledWith(
          enabled
            ? {
                action: 'disable_delivery',
                platform: 'windows',
                environmentRevision: 8,
              }
            : {
                action: 'enable_delivery',
                platform: 'windows',
                environmentRevision: 8,
                versionId: 'active',
                revision: 7,
              }
        )
      );
      expectPrivateCacheEmpty(view.client);
    }
  );
  it.each([undefined, null, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'cannot invent missing or invalid revision %s',
    async (revision) => {
      const current = admissionState();
      current.platforms[0]!.revision = revision;
      mock.state.mockResolvedValue(current);
      mount();
      expect(
        (await windowsPanel()).getByRole('button', { name: 'enableDelivery' })
      ).toBeDisabled();
      expect(mock.mutate).not.toHaveBeenCalled();
    }
  );
  it.each(['missing', 'unvalidated', 'mismatch'])(
    'blocks %s active version while leaving disable credential-free',
    async (mode) => {
      const current = admissionState();
      current.versions =
        mode === 'missing'
          ? []
          : current.versions.map((version) =>
              version.status === 'active'
                ? {
                    ...version,
                    validatedRevision:
                      mode === 'unvalidated' ? null : version.revision,
                  }
                : version
            );
      if (mode === 'mismatch') current.platforms[0]!.activeVersionId = 'other';
      mock.state.mockResolvedValue(current);
      const view = mount();
      expect(
        (await windowsPanel()).getByRole('button', { name: 'enableDelivery' })
      ).toBeDisabled();
      view.client.setQueryData(['desktop-signing-vault', 'alice'], {
        ...current,
        platforms: current.platforms.map((entry) => ({
          ...entry,
          enabled: entry.platform === 'windows',
        })),
      });
      const stop = await screen.findByRole('button', {
        name: 'disableDelivery',
      });
      expect(stop).toBeEnabled();
      fireEvent.click(stop);
      await waitFor(() =>
        expect(mock.mutate).toHaveBeenCalledWith({
          action: 'disable_delivery',
          platform: 'windows',
          environmentRevision: 8,
        })
      );
    }
  );
  it('cancels enable confirmation without dispatch', async () => {
    mock.state.mockResolvedValue(admissionState());
    mount();
    fireEvent.click(
      (await windowsPanel()).getByRole('button', { name: 'enableDelivery' })
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'cancelAdmission' })
    );
    expect(mock.mutate).not.toHaveBeenCalled();
  });
  it('drops a stale confirmation when environment identity or revision changes', async () => {
    mock.state.mockResolvedValue(admissionState());
    const view = mount();
    fireEvent.click(
      (await windowsPanel()).getByRole('button', { name: 'enableDelivery' })
    );
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    const fresh = admissionState();
    fresh.platforms[0]!.revision = 9;
    view.client.setQueryData(['desktop-signing-vault', 'alice'], fresh);
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(mock.mutate).not.toHaveBeenCalled();
  });
  it('blocks concurrent controls while one actor-owned mutation is pending', async () => {
    let finish!: (result: { state: DesktopVaultState }) => void;
    mock.state.mockResolvedValue(admissionState(true));
    mock.mutate.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const view = mount();
    const panel = await windowsPanel();
    const stop = panel.getByRole('button', { name: 'disableDelivery' });
    fireEvent.click(stop);
    fireEvent.click(stop);
    await waitFor(() => expect(mock.mutate).toHaveBeenCalledOnce());
    expect(stop).toBeDisabled();
    expectPrivateCacheEmpty(view.client);
    finish({ state: admissionState(false) });
    await waitFor(() => expect(view.client.isMutating()).toBe(0));
  });
  it('rejects late admission publication after actor ABA and uses fresh CAS', async () => {
    let finish!: (result: { state: DesktopVaultState }) => void;
    mock.state.mockResolvedValue(admissionState());
    mock.mutate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const view = mount();
    await enableWindows();
    await waitFor(() => expect(mock.mutate).toHaveBeenCalledOnce());
    const fresh = admissionState();
    fresh.platforms[0]!.revision = 10;
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
    finish({ state: admissionState(true) });
    await waitFor(() => expect(view.client.isMutating()).toBe(0));
    expect(
      view.client.getQueryData(['desktop-signing-vault', 'alice'])
    ).toEqual(fresh);
    await enableWindows();
    await waitFor(() =>
      expect(mock.mutate).toHaveBeenLastCalledWith({
        action: 'enable_delivery',
        platform: 'windows',
        environmentRevision: 10,
        versionId: 'active',
        revision: 7,
      })
    );
    expectPrivateCacheEmpty(view.client);
  });
});
