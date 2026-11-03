import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const meetAiWorkerEnv = vi.hoisted(() => vi.fn());
vi.mock(
  '@tuturuuu/meet-core/features/meeting-ai/server/workspace-gate',
  () => ({ meetAiWorkerEnv })
);

import { isMeetAiEnabledOnWeb } from './meet-ai-gate';

const ENV = 'MEET_AI_ENABLED_WORKSPACE_IDS';
const WS = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const EASY_CENTER = '00000000-0000-4000-8000-0000000000ee';

describe(isMeetAiEnabledOnWeb, () => {
  beforeEach(() => {
    meetAiWorkerEnv.mockResolvedValue(undefined);
    vi.stubEnv(ENV, '');
    vi.stubEnv('MEET_AI_PROTECTED_WORKSPACE_IDS', EASY_CENTER);
    vi.stubEnv('MEET_AI_DISABLED', undefined);
    vi.stubEnv('MEET_AI_DISABLED_WORKSPACE_IDS', undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('denies when controls are unset (default-off)', async () => {
    delete process.env[ENV];
    await expect(isMeetAiEnabledOnWeb(WS)).resolves.toBe(false);
  });

  it.each(['', '   ', '\n\t', ' , ,'])(
    'denies every workspace for a blank allowlist %j',
    async (value) => {
      vi.stubEnv(ENV, value);
      await expect(isMeetAiEnabledOnWeb(WS)).resolves.toBe(false);
      await expect(isMeetAiEnabledOnWeb(OTHER)).resolves.toBe(false);
    }
  );

  it('denies every workspace when the allowlist is absent', async () => {
    vi.stubEnv(ENV, undefined);
    await expect(isMeetAiEnabledOnWeb(WS)).resolves.toBe(false);
    await expect(isMeetAiEnabledOnWeb(OTHER)).resolves.toBe(false);
    meetAiWorkerEnv.mockResolvedValue({});
    await expect(isMeetAiEnabledOnWeb(WS)).resolves.toBe(false);
  });

  it('denies Easy Center by the protected secret even when it is allowlisted', async () => {
    vi.stubEnv(ENV, `${EASY_CENTER},${WS}`);
    vi.stubEnv('MEET_AI_DISABLED', 'false');
    await expect(isMeetAiEnabledOnWeb(EASY_CENTER)).resolves.toBe(false);
    await expect(isMeetAiEnabledOnWeb(WS)).resolves.toBe(true);
    meetAiWorkerEnv.mockResolvedValue({ [ENV]: EASY_CENTER });
    await expect(isMeetAiEnabledOnWeb(EASY_CENTER)).resolves.toBe(false);
  });

  it('allows a listed workspace and denies an unlisted one', async () => {
    vi.stubEnv(ENV, `${WS}, ${OTHER.toUpperCase()}`);
    await expect(isMeetAiEnabledOnWeb(WS)).resolves.toBe(true);
    await expect(isMeetAiEnabledOnWeb(OTHER)).resolves.toBe(true);
    await expect(
      isMeetAiEnabledOnWeb('33333333-3333-4333-8333-333333333333')
    ).resolves.toBe(false);
  });

  it.each(['1', 'true', 'garbage', ''])(
    'denies kill switch %j',
    async (value) => {
      vi.stubEnv(ENV, WS);
      vi.stubEnv('MEET_AI_DISABLED', value);
      await expect(isMeetAiEnabledOnWeb(WS)).resolves.toBe(false);
    }
  );
  it('denies listed workspaces and malformed deny lists', async () => {
    vi.stubEnv(ENV, WS);
    for (const value of [WS, `${WS},garbage`, '*']) {
      vi.stubEnv('MEET_AI_DISABLED_WORKSPACE_IDS', value);
      await expect(isMeetAiEnabledOnWeb(WS)).resolves.toBe(false);
    }
  });
  it('does not fall back from a malformed binding to an ambient allow', async () => {
    vi.stubEnv('MEET_AI_DISABLED', 'false');
    vi.stubEnv(ENV, WS);
    meetAiWorkerEnv.mockResolvedValue({ MEET_AI_DISABLED: 1 });
    await expect(isMeetAiEnabledOnWeb(WS)).resolves.toBe(false);
  });
  it('denies a missing workspace id', async () => {
    vi.stubEnv(ENV, WS);
    await expect(isMeetAiEnabledOnWeb(null)).resolves.toBe(false);
    await expect(isMeetAiEnabledOnWeb(undefined)).resolves.toBe(false);
  });

  it.each(['*', 'all', '*.*', `${WS.slice(0, 8)}*`, '.*', `*,${WS}`])(
    'denies wildcard or malformed allowlist %j for every workspace',
    async (value) => {
      vi.stubEnv(ENV, value);
      await expect(isMeetAiEnabledOnWeb(WS)).resolves.toBe(false);
    }
  );

  it('prefers the Cloudflare binding over process.env when it is set', async () => {
    vi.stubEnv(ENV, OTHER);
    meetAiWorkerEnv.mockResolvedValue({ [ENV]: WS });
    await expect(isMeetAiEnabledOnWeb(WS)).resolves.toBe(true);
    await expect(isMeetAiEnabledOnWeb(OTHER)).resolves.toBe(false);
  });

  it('falls back to process.env when the binding is absent', async () => {
    vi.stubEnv(ENV, WS);
    meetAiWorkerEnv.mockResolvedValue({});
    await expect(isMeetAiEnabledOnWeb(WS)).resolves.toBe(true);
    meetAiWorkerEnv.mockResolvedValue(undefined);
    await expect(isMeetAiEnabledOnWeb(WS)).resolves.toBe(true);
  });

  it('is server-only and never exposes the variable to client bundles', () => {
    const source = readFileSync(join(__dirname, 'meet-ai-gate.ts'), 'utf8');
    expect(source).toMatch(/^import 'server-only';/);
    expect(source).not.toContain('NEXT_PUBLIC');
    const route = readFileSync(join(__dirname, 'route.ts'), 'utf8');
    expect(route).not.toContain('NEXT_PUBLIC');
  });
});
