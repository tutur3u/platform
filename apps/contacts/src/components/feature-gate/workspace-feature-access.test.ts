import { describe, expect, it } from 'vitest';
import {
  isWorkspaceFeatureEnabled,
  resolveWorkspaceFeatureAccess,
  type WorkspaceFeatureAccessInput,
} from './workspace-feature-access';

const base: WorkspaceFeatureAccessInput = {
  canEnableFeature: true,
  canManageFeature: true,
  canView: true,
  enabled: true,
  hasWorkspaceAccess: true,
};

describe('isWorkspaceFeatureEnabled', () => {
  it('keeps a shared workspace on its pre-gate default', () => {
    expect(
      isWorkspaceFeatureEnabled({
        defaultEnabled: true,
        isPersonal: false,
        value: null,
      })
    ).toBe(true);
    expect(
      isWorkspaceFeatureEnabled({
        defaultEnabled: false,
        isPersonal: false,
        value: null,
      })
    ).toBe(false);
  });

  it('leaves personal workspaces opted out until they opt in', () => {
    expect(
      isWorkspaceFeatureEnabled({
        defaultEnabled: true,
        isPersonal: true,
        value: undefined,
      })
    ).toBe(false);
    expect(
      isWorkspaceFeatureEnabled({
        defaultEnabled: true,
        isPersonal: true,
        value: 'true',
      })
    ).toBe(true);
  });

  it('honors an explicit off switch on a shared workspace', () => {
    expect(
      isWorkspaceFeatureEnabled({
        defaultEnabled: true,
        isPersonal: false,
        value: 'false',
      })
    ).toBe(false);
  });

  it('tolerates stored casing and padding', () => {
    expect(
      isWorkspaceFeatureEnabled({
        defaultEnabled: false,
        isPersonal: true,
        value: ' TRUE ',
      })
    ).toBe(true);
    expect(
      isWorkspaceFeatureEnabled({
        defaultEnabled: true,
        isPersonal: false,
        value: 'False\n',
      })
    ).toBe(false);
  });

  it('falls back to the default for an unparseable value', () => {
    expect(
      isWorkspaceFeatureEnabled({
        defaultEnabled: true,
        isPersonal: false,
        value: 'yes',
      })
    ).toBe(true);
    expect(
      isWorkspaceFeatureEnabled({
        defaultEnabled: true,
        isPersonal: false,
        value: '',
      })
    ).toBe(true);
  });
});

describe('resolveWorkspaceFeatureAccess', () => {
  it('renders the module for an enabled workspace', () => {
    expect(resolveWorkspaceFeatureAccess(base)).toEqual({
      canManage: true,
      status: 'ready',
    });
  });

  it('reports read-only access when management is not granted', () => {
    expect(
      resolveWorkspaceFeatureAccess({ ...base, canManageFeature: false })
    ).toEqual({ canManage: false, status: 'ready' });
  });

  it('offers enablement instead of a 404 when the module is off', () => {
    expect(resolveWorkspaceFeatureAccess({ ...base, enabled: false })).toEqual({
      canEnable: true,
      status: 'disabled',
    });
  });

  it('explains a disabled module without a button members cannot use', () => {
    expect(
      resolveWorkspaceFeatureAccess({
        ...base,
        canEnableFeature: false,
        enabled: false,
      })
    ).toEqual({ canEnable: false, status: 'disabled' });
  });

  it('reports a permission denial ahead of the toggle', () => {
    expect(
      resolveWorkspaceFeatureAccess({
        ...base,
        canView: false,
        enabled: false,
      })
    ).toEqual({ status: 'forbidden' });
  });

  it('reports an unresolved workspace ahead of every other check', () => {
    expect(
      resolveWorkspaceFeatureAccess({
        ...base,
        canView: false,
        enabled: false,
        hasWorkspaceAccess: false,
      })
    ).toEqual({ status: 'unavailable' });
  });
});
