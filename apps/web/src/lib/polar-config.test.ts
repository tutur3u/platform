import { describe, expect, it } from 'vitest';
import {
  hasUsablePolarCredential,
  isPolarWorkspaceSetupEnabled,
} from './polar-config';

describe('hasUsablePolarCredential', () => {
  it('rejects empty and placeholder values', () => {
    expect(hasUsablePolarCredential(undefined)).toBe(false);
    expect(hasUsablePolarCredential('')).toBe(false);
    expect(hasUsablePolarCredential('placeholder')).toBe(false);
    expect(hasUsablePolarCredential('your-polar-access-token')).toBe(false);
    expect(hasUsablePolarCredential('<polar-token>')).toBe(false);
  });

  it('accepts non-placeholder credential values', () => {
    expect(hasUsablePolarCredential('polar_oat_live_abc123')).toBe(true);
  });
});

describe('isPolarWorkspaceSetupEnabled', () => {
  const credentials = {
    POLAR_ACCESS_TOKEN: 'polar_oat_live_abc123',
    POLAR_WEBHOOK_SECRET: 'polar_whsec_abc123',
  };

  it('is disabled when required credentials are missing', () => {
    expect(
      isPolarWorkspaceSetupEnabled(
        { POLAR_WEBHOOK_SECRET: credentials.POLAR_WEBHOOK_SECRET },
        { devMode: false }
      )
    ).toBe(false);
    expect(
      isPolarWorkspaceSetupEnabled(
        { POLAR_ACCESS_TOKEN: credentials.POLAR_ACCESS_TOKEN },
        { devMode: false }
      )
    ).toBe(false);
  });

  it('is disabled for placeholder credentials', () => {
    expect(
      isPolarWorkspaceSetupEnabled(
        {
          POLAR_ACCESS_TOKEN: 'your-polar-access-token',
          POLAR_WEBHOOK_SECRET: credentials.POLAR_WEBHOOK_SECRET,
        },
        { devMode: false }
      )
    ).toBe(false);
  });

  it('is enabled in production-like environments with real credentials', () => {
    expect(isPolarWorkspaceSetupEnabled(credentials, { devMode: false })).toBe(
      true
    );
  });

  it('requires explicit opt-in for automatic workspace setup in local dev', () => {
    expect(isPolarWorkspaceSetupEnabled(credentials, { devMode: true })).toBe(
      false
    );
    expect(
      isPolarWorkspaceSetupEnabled(
        {
          ...credentials,
          POLAR_ENABLE_LOCAL_WORKSPACE_SETUP: 'true',
        },
        { devMode: true }
      )
    ).toBe(true);
  });

  it('honors the explicit workspace setup override', () => {
    expect(
      isPolarWorkspaceSetupEnabled(
        {
          ...credentials,
          POLAR_WORKSPACE_SETUP_ENABLED: 'false',
        },
        { devMode: false }
      )
    ).toBe(false);
    expect(
      isPolarWorkspaceSetupEnabled(
        {
          ...credentials,
          POLAR_WORKSPACE_SETUP_ENABLED: 'true',
        },
        { devMode: true }
      )
    ).toBe(true);
  });
});
