import { beforeEach, describe, expect, it, vi } from 'vitest';

const actorAdmin = { kind: 'actor-admin' };
const cookieClient = { kind: 'cookie' };
const user = { id: 'user-1' };

const gate = vi.hoisted(() => ({
  actor: vi.fn(),
  access: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  resolveSatellitePageActor: gate.actor,
}));
vi.mock('@tuturuuu/education-core/tulearn/lms-area-access', () => ({
  hasLmsLearningAreaAccess: gate.access,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: gate.createClient,
}));

import { resolveTeachAreaSwitchHref } from './lms-area-switch';

beforeEach(() => {
  vi.clearAllMocks();
  gate.createClient.mockResolvedValue(cookieClient);
  gate.access.mockResolvedValue(true);
});

describe('Teach area switch server adapter', () => {
  it('passes the verified actor admin client into the learner check', async () => {
    gate.actor.mockResolvedValue({ admin: actorAdmin, user });

    const href = await resolveTeachAreaSwitchHref({
      currentWsId: 'ws-current',
      locale: 'en',
      workspaceIds: ['ws-current'],
    });

    expect(href).toBe('/lms/learn/en/dashboard');
    expect(gate.actor).toHaveBeenCalledWith('teach');
    expect(gate.createClient).not.toHaveBeenCalled();
    expect(gate.access).toHaveBeenCalledWith({
      supabase: actorAdmin,
      user,
      wsId: 'ws-current',
    });
  });

  it('returns null without an access check when the page has no actor', async () => {
    gate.actor.mockResolvedValue(null);

    const href = await resolveTeachAreaSwitchHref({
      currentWsId: 'ws-current',
      locale: 'vi',
      workspaceIds: ['ws-current'],
    });

    expect(href).toBeNull();
    expect(gate.access).not.toHaveBeenCalled();
    expect(gate.createClient).not.toHaveBeenCalled();
  });
});
