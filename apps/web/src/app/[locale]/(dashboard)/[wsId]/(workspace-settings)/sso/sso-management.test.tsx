import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import type {
  SsoClientDetail,
  SsoManagedClient,
} from '@tuturuuu/internal-api/sso';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../../../../messages/en.json';
import { ClientDetails } from './client-details';
import { CopyValue } from './public-setup';
import { SsoManagement } from './sso-management';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  toggle: vi.fn(),
  detail: vi.fn(),
  assign: vi.fn(),
  clipboard: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/sso', () => ({
  SSO_NAME_ID_FORMAT: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
  listSsoClients: mocks.list,
  createSsoClient: mocks.create,
  updateSsoClient: mocks.update,
  setSsoClientEnabled: mocks.toggle,
  getSsoClientDetail: mocks.detail,
  setSsoAssignment: mocks.assign,
}));
vi.mock('@/app/[locale]/(auth)/sso/consent/reauthenticate', () => ({
  Reauthenticate: () => <p>Verification form</p>,
}));
const client: SsoManagedClient = {
  id: 'client-a',
  displayName: 'Claude team',
  enabled: false,
  revision: 3,
  domains: ['example.test'],
  entityId: 'urn:workos:test',
  acsUrl: 'https://sp.example.test/acs',
  nameIdFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
  requestSigningMode: 'unsigned',
  spCertificate: null,
};
const detail: SsoClientDetail = {
  members: [
    { userId: 'member-a', displayName: 'Ada', active: false, revision: 0 },
  ],
  keys: [],
  audit: [],
  setup: {
    metadataUrl: 'https://idp.example.test/metadata',
    entityId: 'https://idp.example.test/metadata',
    ssoUrl: 'https://idp.example.test/sso',
  },
  pilotSelected: false,
};
function mount(component = <SsoManagement wsId="ws-a" />) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={cache}>
      <NextIntlClientProvider locale="en" messages={messages}>
        {component}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.list.mockResolvedValue({ clients: [client], globalEnabled: false });
  mocks.detail.mockResolvedValue(detail);
  mocks.create.mockResolvedValue({ id: client.id, revision: 1 });
  mocks.update.mockResolvedValue({ id: client.id, revision: 4 });
  mocks.toggle.mockResolvedValue({ id: client.id, revision: 4 });
  mocks.assign.mockResolvedValue({ ok: true });
  mocks.clipboard.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mocks.clipboard },
  });
});
describe('SSO admin interactions', () => {
  it('shows global flag off and requires an in-app enable confirmation', async () => {
    mount();
    expect(
      await screen.findByText('Server SAML flag: off — issuance is disabled')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enable' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/Confirm the exact SP entity ID/)
    ).toBeInTheDocument();
    expect(mocks.toggle).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Confirm enable' })
    );
    await waitFor(() =>
      expect(mocks.toggle).toHaveBeenCalledWith('ws-a', 'client-a', {
        enabled: true,
        confirmEnable: true,
        expectedRevision: 3,
      })
    );
  });
  it('canceling confirmation leaves client disabled', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Enable' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      })
    );
    expect(mocks.toggle).not.toHaveBeenCalled();
  });
  it('creates a disabled application with exact SP settings and explicit signature choice', async () => {
    mount();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Add SSO application' })
    );
    for (const [label, value] of [
      ['Application / Claude organization name', 'WorkOS fixture'],
      ['SP entity ID', 'urn:workos:fixture'],
      ['Exact ACS URL', 'https://sp.example.test/exact'],
      ['Approved email domains', 'example.test, company.test'],
    ] as const) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    expect(screen.getByLabelText('AuthnRequest signatures')).toHaveValue(
      'required'
    );
    fireEvent.change(screen.getByLabelText('AuthnRequest signatures'), {
      target: { value: 'unsigned' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save disabled application' })
    );
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith('ws-a', {
        displayName: 'WorkOS fixture',
        entityId: 'urn:workos:fixture',
        acsUrl: 'https://sp.example.test/exact',
        domains: ['example.test', 'company.test'],
        nameIdFormat: client.nameIdFormat,
        requestSigning: { mode: 'unsigned' },
      })
    );
  });
  it('editing an enabled application disables it and preserves revision', async () => {
    mocks.list.mockResolvedValue({
      clients: [{ ...client, enabled: true }],
      globalEnabled: false,
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(
      screen.getByLabelText('Application / Claude organization name'),
      { target: { value: 'Changed' } }
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save disabled application' })
    );
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(
        'ws-a',
        'client-a',
        expect.objectContaining({
          displayName: 'Changed',
          enabled: false,
          expectedRevision: 3,
        })
      )
    );
  });
  it('can disable a legacy enabled client without replacing its deployment trust policy', async () => {
    mocks.list.mockResolvedValue({
      clients: [{ ...client, enabled: true, requestSigningMode: null }],
      globalEnabled: true,
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Disable' }));
    await waitFor(() =>
      expect(mocks.toggle).toHaveBeenCalledWith('ws-a', 'client-a', {
        enabled: false,
        confirmEnable: false,
        expectedRevision: 3,
      })
    );
  });
  it('assigns a member using the current assignment revision', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Claude team' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Assign Ada' }));
    await waitFor(() =>
      expect(mocks.assign).toHaveBeenCalledWith('ws-a', 'client-a', {
        userId: 'member-a',
        active: true,
        expectedRevision: 0,
      })
    );
  });
  it('revokes an existing member assignment', async () => {
    mocks.detail.mockResolvedValue({
      ...detail,
      members: [{ ...detail.members[0], active: true, revision: 7 }],
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Claude team' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke Ada' }));
    await waitFor(() =>
      expect(mocks.assign).toHaveBeenCalledWith('ws-a', 'client-a', {
        userId: 'member-a',
        active: false,
        expectedRevision: 7,
      })
    );
  });
  it('clears member content when switching client scopes', async () => {
    const view = mount(<ClientDetails wsId="ws-a" clientId="client-a" />);
    expect(await screen.findByText('Ada')).toBeInTheDocument();
    mocks.detail.mockReturnValue(new Promise(() => {}));
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="en" messages={messages}>
          <ClientDetails wsId="ws-b" clientId="client-b" />
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
    expect(screen.queryByText('Ada')).not.toBeInTheDocument();
  });
  it('copies public setup values with accessible feedback', async () => {
    mount(<CopyValue label="IdP certificate" value="public fixture" />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Copy IdP certificate' })
    );
    await screen.findByText('Copied');
    expect(mocks.clipboard).toHaveBeenCalledWith('public fixture');
  });
  it('exposes MFA recovery after a failed enable without replaying the change', async () => {
    mocks.toggle.mockRejectedValue(
      new InternalApiError('sso_mfa_required', 403)
    );
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Enable' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Confirm enable',
      })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Verify your current TOTP factor'
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Verification form')).toBeInTheDocument();
    expect(mocks.toggle).toHaveBeenCalledTimes(1);
  });
  it('keeps stale edits visible and asks for refresh without retry', async () => {
    mocks.update.mockRejectedValue(
      new InternalApiError('sso_revision_conflict', 409)
    );
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save disabled application' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'These settings changed'
    );
    expect(screen.getByLabelText('Exact ACS URL')).toHaveValue(client.acsUrl);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
  it('reports unavailable overview without exposing raw errors', async () => {
    mocks.list.mockRejectedValue(new Error('sensitive upstream detail'));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'SSO settings are unavailable'
    );
    expect(screen.queryByText(/sensitive/)).not.toBeInTheDocument();
  });
});
