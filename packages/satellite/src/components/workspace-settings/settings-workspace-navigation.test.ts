import { describe, expect, it } from 'vitest';
import { resolveSatelliteSettingsWorkspacePath } from './settings-workspace-navigation';

describe('resolveSatelliteSettingsWorkspacePath', () => {
  it('uses the canonical Tasks entrypoint for team workspaces', () => {
    expect(
      resolveSatelliteSettingsWorkspacePath({
        activeTab: 'workspace_general',
        appId: 'tasks',
        nextSlug: 'internal',
      })
    ).toBe('/internal/tasks?settingsDialog=open&settingsTab=workspace_general');
  });

  it('uses the canonical Tasks entrypoint for personal workspaces', () => {
    expect(
      resolveSatelliteSettingsWorkspacePath({
        activeTab: 'workspace_members',
        appId: 'tasks',
        nextSlug: 'personal',
      })
    ).toBe('/personal/tasks?settingsDialog=open&settingsTab=workspace_members');
  });

  it('uses the selected workspace root for workspace-root satellites', () => {
    expect(
      resolveSatelliteSettingsWorkspacePath({
        activeTab: 'workspace_general',
        appId: 'calendar',
        nextSlug: 'internal',
      })
    ).toBe('/internal?settingsDialog=open&settingsTab=workspace_general');
  });

  it('falls back to the selected workspace root for apps without a catalog resolver', () => {
    expect(
      resolveSatelliteSettingsWorkspacePath({
        activeTab: 'profile',
        appId: 'rewise',
        nextSlug: 'workspace-1',
      })
    ).toBe('/workspace-1?settingsDialog=open&settingsTab=profile');
  });
});
