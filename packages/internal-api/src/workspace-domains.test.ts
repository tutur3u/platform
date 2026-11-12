import { describe, expect, it, vi } from 'vitest';
import {
  addWorkspaceDomain,
  listWorkspaceDomains,
  removeWorkspaceDomain,
  verifyWorkspaceDomain,
} from './workspace-domains';

describe('workspace domains transport', () => {
  it('scopes every call to the escaped workspace and domain', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}'));
    await listWorkspaceDomains('ws/a', { fetch });
    expect(fetch).toHaveBeenLastCalledWith(
      'https://tuturuuu.localhost/api/v1/workspaces/ws%2Fa/domains',
      expect.objectContaining({ cache: 'no-store' })
    );
    fetch.mockResolvedValue(new Response('{}'));
    await verifyWorkspaceDomain('ws', 'd/1', { fetch });
    expect(fetch).toHaveBeenLastCalledWith(
      'https://tuturuuu.localhost/api/v1/workspaces/ws/domains/d%2F1/verify',
      expect.objectContaining({ method: 'POST' })
    );
    fetch.mockResolvedValue(new Response('{}'));
    await removeWorkspaceDomain('ws', 'd1', { fetch });
    expect(fetch).toHaveBeenLastCalledWith(
      'https://tuturuuu.localhost/api/v1/workspaces/ws/domains/d1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('sends only the hostname when adding', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}'));
    await addWorkspaceDomain('ws', 'example.com', { fetch });
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      hostname: 'example.com',
    });
  });
});
