import { describe, expect, it, vi } from 'vitest';
import {
  createSsoClient,
  getSsoClientDetail,
  listSsoClients,
  SSO_NAME_ID_FORMAT,
  setSsoAssignment,
  setSsoClientEnabled,
  updateSsoClient,
} from './sso';

describe('SSO management transport', () => {
  it('uses no-store reads with escaped workspace and client scopes', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}'));
    await listSsoClients('ws/a', { fetch });
    expect(fetch).toHaveBeenCalledWith(
      'https://tuturuuu.localhost/api/v1/workspaces/ws%2Fa/sso/clients',
      expect.objectContaining({ cache: 'no-store' })
    );
    fetch.mockResolvedValue(new Response('{}'));
    await getSsoClientDetail('ws-a', 'client/a', { fetch });
    expect(fetch).toHaveBeenLastCalledWith(
      'https://tuturuuu.localhost/api/v1/workspaces/ws-a/sso/clients/client%2Fa',
      expect.objectContaining({ cache: 'no-store' })
    );
  });
  it('creates with exact profile and no enabled field', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}'));
    const input = {
      displayName: 'Claude',
      domains: ['example.test'],
      entityId: 'urn:sp',
      acsUrl: 'https://sp.example.test/acs',
      nameIdFormat: SSO_NAME_ID_FORMAT,
      requestSigning: { mode: 'unsigned' as const },
    };
    await createSsoClient('ws-a', input, { fetch });
    expect(fetch).toHaveBeenCalledWith(
      'https://tuturuuu.localhost/api/v1/workspaces/ws-a/sso/clients',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(input),
        cache: 'no-store',
      })
    );
    fetch.mockResolvedValue(new Response('{}'));
    await updateSsoClient(
      'ws-a',
      'client-a',
      { ...input, enabled: false, expectedRevision: 3 },
      { fetch }
    );
    expect(fetch).toHaveBeenLastCalledWith(
      'https://tuturuuu.localhost/api/v1/workspaces/ws-a/sso/clients/client-a',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ ...input, enabled: false, expectedRevision: 3 }),
      })
    );
  });
  it('sends explicit activation confirmation and assignment revision', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}'));
    await setSsoClientEnabled(
      'ws-a',
      'client-a',
      { enabled: true, expectedRevision: 3, confirmEnable: true },
      { fetch }
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://tuturuuu.localhost/api/v1/workspaces/ws-a/sso/clients/client-a/activation',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          enabled: true,
          expectedRevision: 3,
          confirmEnable: true,
        }),
      })
    );
    fetch.mockResolvedValue(new Response('{}'));
    await setSsoAssignment(
      'ws-a',
      'client-a',
      { userId: 'user-a', active: false, expectedRevision: 2 },
      { fetch }
    );
    expect(fetch).toHaveBeenLastCalledWith(
      'https://tuturuuu.localhost/api/v1/workspaces/ws-a/sso/clients/client-a/assignments',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          userId: 'user-a',
          active: false,
          expectedRevision: 2,
        }),
      })
    );
  });
});
