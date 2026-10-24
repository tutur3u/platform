import { afterEach, expect, it, vi } from 'vitest';
import { autoReclaim } from './storage-auto-reclaim';
import { runReclaimCommand } from './storage-reclaim-command';

vi.mock('./storage-auto-reclaim', () => ({
  autoReclaim: vi.fn(async () => ({ note: 'fixture' })),
  reclaimAgeDays: () => 7,
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it('unions CLI hold directories with environment hold directories on apply', async () => {
  vi.stubEnv('TTR_STORAGE_HOLDS_DIRS', '/held/env:/held/shared');
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  await runReclaimCommand({
    json: true,
    apply: true,
    auto: false,
    trigger: null,
    paths: ['/tmp'],
    holdsDirs: ['/held/cli'],
    offline: true,
    docker: false,
  });
  expect(
    vi
      .mocked(autoReclaim)
      .mock.calls[0]?.[0].env?.TTR_STORAGE_HOLDS_DIRS?.split(':')
  ).toEqual(['/held/env', '/held/shared', '/held/cli']);
});
