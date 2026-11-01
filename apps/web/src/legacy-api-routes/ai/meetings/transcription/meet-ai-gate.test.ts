import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const meetAiGateEnv = vi.hoisted(() => vi.fn());
vi.mock(
  '@tuturuuu/meet-core/features/meeting-ai/server/workspace-gate',
  () => ({ meetAiGateEnv })
);

import { isMeetAiEnabledOnWeb } from './meet-ai-gate';

const ENV = 'MEET_AI_ENABLED_WORKSPACE_IDS';
const WS = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

describe(isMeetAiEnabledOnWeb, () => {
  beforeEach(() => {
    meetAiGateEnv.mockResolvedValue(undefined);
    vi.stubEnv(ENV, '');
    vi.stubEnv('MEET_AI_DISABLED', undefined);
    vi.stubEnv('MEET_AI_DISABLED_WORKSPACE_IDS', undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('allows when controls are unset', async () => {
    delete process.env[ENV];
    await expect(isMeetAiEnabledOnWeb(WS)).resolves.toBe(true);
  });

  it.each(['', '   ', '\n\t', ' , ,'])(
    'denies every workspace for a present but blank legacy value %j',
    async (value) => {
      vi.stubEnv(ENV, value);
      await expect(isMeetAiEnabledOnWeb(WS)).resolves.toBe(false);
      await expect(isMeetAiEnabledOnWeb(OTHER)).resolves.toBe(false);
    }
  );

  it('allows every workspace when the legacy value is absent', async () => {
    vi.stubEnv(ENV, undefined);
    await expect(isMeetAiEnabledOnWeb(WS)).resolves.toBe(true);
    await expect(isMeetAiEnabledOnWeb(OTHER)).resolves.toBe(true);
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
      vi.stubEnv('MEET_AI_DISABLED', value);
      await expect(isMeetAiEnabledOnWeb(WS)).resolves.toBe(false);
    }
  );
  it('denies listed workspaces and malformed deny lists', async () => {
    for (const value of [WS, `${WS},garbage`, '*']) {
      vi.stubEnv('MEET_AI_DISABLED_WORKSPACE_IDS', value);
      await expect(isMeetAiEnabledOnWeb(WS)).resolves.toBe(false);
    }
  });
  it('does not fall back from a malformed binding to an ambient allow', async () => {
    vi.stubEnv('MEET_AI_DISABLED', 'false');
    meetAiGateEnv.mockResolvedValue({ MEET_AI_DISABLED: 1 });
    await expect(isMeetAiEnabledOnWeb(WS)).resolves.toBe(false);
  });
  it('denies a missing workspace id', async () => {
    vi.stubEnv(ENV, WS);
    await expect(isMeetAiEnabledOnWeb(null)).resolves.toBe(false);
    await expect(isMeetAiEnabledOnWeb(undefined)).resolves.toBe(false);
  });

  it.each(['*', 'all', '*.*', `${WS.slice(0, 8)}*`, '.*'])(
    'treats wildcard %j as no match',
    async (value) => {
      vi.stubEnv(ENV, value);
      await expect(isMeetAiEnabledOnWeb(WS)).resolves.toBe(false);
    }
  );

  it('prefers the Cloudflare binding over process.env when it is set', async () => {
    vi.stubEnv(ENV, OTHER);
    meetAiGateEnv.mockResolvedValue({ [ENV]: WS });
    await expect(isMeetAiEnabledOnWeb(WS)).resolves.toBe(true);
    await expect(isMeetAiEnabledOnWeb(OTHER)).resolves.toBe(false);
  });

  it('falls back to process.env when the binding is absent', async () => {
    vi.stubEnv(ENV, WS);
    meetAiGateEnv.mockResolvedValue({});
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
