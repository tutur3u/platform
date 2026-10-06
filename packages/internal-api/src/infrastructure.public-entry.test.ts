import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  type DesktopVaultMutation,
  type DesktopVaultPlatform,
  type DesktopVaultState,
  type DesktopVaultVersion,
  getDesktopVaultState,
  mutateDesktopVault,
  uploadDesktopVaultFile,
} from './infrastructure';

const state: DesktopVaultState = {
  deliveryEnabled: false,
  platforms: [],
  versions: [],
  tokens: [],
};
const mutation: DesktopVaultMutation = {
  action: 'disable_delivery',
  platform: 'windows',
  environmentRevision: 4,
};

describe('Infrastructure package public entry', () => {
  it('exposes desktop state and typed admission through the shipped file barrel', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json(state));
    expect(
      await getDesktopVaultState({ fetch, baseUrl: 'https://infra.example' })
    ).toEqual(state);
    expect(fetch).toHaveBeenCalledWith(
      'https://infra.example/api/v1/desktop-deployment',
      expect.objectContaining({ cache: 'no-store' })
    );
    expectTypeOf<DesktopVaultPlatform>().toEqualTypeOf<'windows' | 'macos'>();
    expectTypeOf<DesktopVaultVersion['revision']>().toEqualTypeOf<number>();
  });
  it('sends a typed admission mutation through the public helper', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ state }));
    await mutateDesktopVault(mutation, {
      fetch,
      baseUrl: 'https://infra.example',
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://infra.example/api/v1/desktop-deployment',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(mutation),
      })
    );
  });
  it('exports the desktop upload helper and preserves multipart input', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ state }));
    const file = new File(['synthetic'], 'fixture.pfx');
    await uploadDesktopVaultFile(
      { versionId: 'version', revision: 7, name: 'certificate', file },
      { fetch, baseUrl: 'https://infra.example' }
    );
    const request = fetch.mock.calls[0]?.[1];
    if (!(request?.body instanceof FormData))
      throw new Error('Expected multipart upload body');
    expect(request.body.get('file')).toBe(file);
    expect(request.body.get('revision')).toBe('7');
  });
});
