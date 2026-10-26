import { describe, expect, it, vi } from 'vitest';
import { systemProbe } from './resources-system-probes';

describe('trusted system probes', () => {
  it.each([
    ['sysctl', '/usr/sbin/sysctl', '/sbin/sysctl'],
    ['ps', '/bin/ps', '/usr/bin/ps'],
  ] as const)(
    'uses absolute %s paths and bounded fallback without caller environment',
    async (tool, first, fallback) => {
      const exec = vi
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error('missing'), { code: 'ENOENT' })
        )
        .mockResolvedValue({ stdout: '1\n' });
      expect(
        await systemProbe(tool, ['argument'], { timeout: 2000 }, exec)
      ).toEqual({ stdout: '1\n' });
      expect(exec.mock.calls.map((call) => call[0])).toEqual([first, fallback]);
      expect(exec).toHaveBeenLastCalledWith(fallback, ['argument'], {
        timeout: 2000,
        maxBuffer: 64 * 1024,
        env: { LC_ALL: 'C' },
      });
    }
  );

  it('surfaces a failed telemetry read rather than retrying through PATH', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('probe timed out'));
    await expect(
      systemProbe('sysctl', [], { timeout: 2000 }, exec)
    ).rejects.toThrow('probe timed out');
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('fails closed after both trusted locations are unavailable', async () => {
    const exec = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('missing'), { code: 'ENOENT' })
      );
    await expect(
      systemProbe('ps', [], { timeout: 2000 }, exec)
    ).rejects.toThrow('missing');
    expect(exec).toHaveBeenCalledTimes(2);
  });
});
