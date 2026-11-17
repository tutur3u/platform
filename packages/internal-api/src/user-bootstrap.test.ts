import { describe, expect, it } from 'vitest';
import {
  BOOTSTRAP_CONFIG_IDS,
  BOOTSTRAP_ERROR_CODES,
  BOOTSTRAP_SECTIONS,
  BootstrapSection,
  UserBootstrapResponse,
} from './user-bootstrap';

const actorId = '00000000-0000-4000-8000-000000000001';

describe('user bootstrap contract', () => {
  it('keeps the closed section and config vocabularies', () => {
    expect([...BOOTSTRAP_SECTIONS]).toEqual([
      'profile',
      'workspace',
      'configs',
      'onboarding',
      'unreadCount',
      'invitations',
      'hiddenWorkspaces',
      'workspaces',
    ]);
    expect([...BOOTSTRAP_CONFIG_IDS]).toEqual([
      'SORBET_THEME',
      'EXPERIMENTAL_SORBET_UI',
      'SIDEBAR_BEHAVIOR',
      'SHOW_VERSION_BADGE',
    ]);
    expect(BOOTSTRAP_ERROR_CODES).toContain('workspace_unavailable');
    expect(BootstrapSection.safeParse('admin').success).toBe(false);
  });

  it('parses ok and error sections and per-id configs', () => {
    const parsed = UserBootstrapResponse.safeParse({
      actorId,
      sections: {
        configs: {
          SHOW_VERSION_BADGE: {
            error: { code: 'forbidden', status: 403 },
            ok: false,
          },
          SORBET_THEME: { data: { value: null }, ok: true },
        },
        onboarding: { data: null, ok: true },
        unreadCount: { data: { count: 2 }, ok: true },
        workspace: {
          error: { code: 'workspace_unavailable', status: 404 },
          ok: false,
        },
      },
      version: 1,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown section, a wrong version and an unknown error code', () => {
    const base = { actorId, sections: {}, version: 1 };
    expect(UserBootstrapResponse.safeParse(base).success).toBe(true);
    expect(
      UserBootstrapResponse.safeParse({ ...base, sections: { extra: {} } })
        .success
    ).toBe(false);
    expect(
      UserBootstrapResponse.safeParse({ ...base, version: 2 }).success
    ).toBe(false);
    expect(
      UserBootstrapResponse.safeParse({
        ...base,
        sections: {
          profile: { error: { code: 'boom', status: 500 }, ok: false },
        },
      }).success
    ).toBe(false);
  });
});
