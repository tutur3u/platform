import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { describe, expect, it } from 'vitest';
import { workspaceHomeRedirectUrl } from './workspace-home-redirect';

const url = (path: string) => new URL(path, 'http://localhost');
const localize = (path: string) => path;

describe('workspaceHomeRedirectUrl', () => {
  it('keeps settings deep-link params and drops other root params', () => {
    expect(
      workspaceHomeRedirectUrl(
        { id: 'personal-ws-id', personal: true },
        url('/?view=kanban&settingsTab=security'),
        localize
      ).toString()
    ).toBe('http://localhost/personal?settingsTab=security');
  });

  it('targets internal for the root workspace and the id otherwise', () => {
    expect(
      workspaceHomeRedirectUrl({ id: ROOT_WORKSPACE_ID }, url('/'), localize)
        .pathname
    ).toBe('/internal');
    expect(
      workspaceHomeRedirectUrl({ id: 'ws-123' }, url('/dashboard'), localize)
        .pathname
    ).toBe('/ws-123');
  });

  it('applies the active locale prefix', () => {
    expect(
      workspaceHomeRedirectUrl(
        { id: 'ws-1', personal: true },
        url('/vi?settingsDialog=open&settingsTab=profile'),
        (path) => `/vi${path}`
      ).toString()
    ).toBe(
      'http://localhost/vi/personal?settingsDialog=open&settingsTab=profile'
    );
  });
});
