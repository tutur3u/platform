import { describe, expect, it, vi } from 'vitest';

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
vi.mock('@tuturuuu/meet-core/runtime', () => ({ MEETING_APP: 'parley' }));

import { liveWorkspaceAllowed } from '../../../cloudflare/live/workspace-gate';
import { isMeetAiAvailableForWorkspace } from './workspace-gate';

const ws = '00000000-0000-4000-8000-0000000000aa';
const protectedWs = '00000000-0000-4000-8000-0000000000ee';
const base = { MEET_AI_PROTECTED_WORKSPACE_IDS: protectedWs };
for (const [name, gate] of [
  ['HTTP', (id: string, env: object) => isMeetAiAvailableForWorkspace(id, env)],
  [
    'Live',
    (id: string, env: object) =>
      liveWorkspaceAllowed(env, {
        claims: { app: 'parley' },
        identity: { workspaceId: id },
      }),
  ],
] as const)
  describe(`Parley ${name}`, () => {
    it('skips only allowlist and denylist', () => {
      expect(
        gate(ws, {
          ...base,
          MEET_AI_ENABLED_WORKSPACE_IDS: '',
          MEET_AI_DISABLED_WORKSPACE_IDS: ws,
        })
      ).toBe(true);
    });
    it('obeys the kill switch', () => {
      expect(gate(ws, { ...base, MEET_AI_DISABLED: 'true' })).toBe(false);
    });
    it('denies a protected workspace even when allowlisted', () => {
      expect(
        gate(protectedWs, {
          ...base,
          MEET_AI_ENABLED_WORKSPACE_IDS: protectedWs,
        })
      ).toBe(false);
    });
    it.each([undefined, '', '*', 'garbage', 1])(
      'fails closed with unusable protected config %j',
      (value) => {
        expect(gate(ws, { MEET_AI_PROTECTED_WORKSPACE_IDS: value })).toBe(
          false
        );
      }
    );
  });
