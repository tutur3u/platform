import { afterEach, expect, it, vi } from 'vitest';
import { traceLettinRead } from './read-diagnostics';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('leaves ordinary reads untouched when diagnostics are disabled', async () => {
  vi.stubEnv('CI', 'false');
  vi.stubEnv('LETTIN_READ_DIAGNOSTICS', 'false');
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  const value = { privateValue: 'synthetic-private-result' };
  expect(await traceLettinRead('D1 entries', async () => value)).toBe(value);
  expect(info).not.toHaveBeenCalled();
});

it('reports fixed stage timings without returned data', async () => {
  vi.stubEnv('CI', 'true');
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(performance, 'now')
    .mockReturnValueOnce(100)
    .mockReturnValueOnce(321);
  const value = { privateValue: 'synthetic-private-result' };
  expect(await traceLettinRead('D1 entries', async () => value)).toBe(value);
  expect(info.mock.calls).toEqual([
    ['[lettin-read]', 'D1 entries', 'started'],
    ['[lettin-read]', 'D1 entries', 'completed', { elapsedMs: 221 }],
  ]);
});

it('preserves the original failure without logging its private message', async () => {
  vi.stubEnv('CI', 'false');
  vi.stubEnv('LETTIN_READ_DIAGNOSTICS', 'true');
  vi.spyOn(console, 'info').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(performance, 'now').mockReturnValueOnce(10).mockReturnValueOnce(40);
  const error = new Error('synthetic-private-failure');
  await expect(
    traceLettinRead('Supabase member names', async () => {
      throw error;
    })
  ).rejects.toBe(error);
  expect(warn.mock.calls).toEqual([
    ['[lettin-read]', 'Supabase member names', 'failed', { elapsedMs: 30 }],
  ]);
});

it('preserves a disabled profile failure without emitting stage events', async () => {
  vi.stubEnv('CI', 'false');
  vi.stubEnv('LETTIN_READ_DIAGNOSTICS', 'false');
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const error = new Error('synthetic-private-profile');
  const read = vi.fn(async () => {
    throw error;
  });
  await expect(traceLettinRead('profile actor', read)).rejects.toBe(error);
  expect(read).toHaveBeenCalledTimes(1);
  expect(info).not.toHaveBeenCalled();
  expect(warn).not.toHaveBeenCalled();
});

it('records a held layout read without completing or replaying it', async () => {
  vi.stubEnv('CI', 'true');
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  const value = { privateValue: 'synthetic-private-workspace' };
  const held = Promise.withResolvers<typeof value>();
  const read = vi.fn(() => held.promise);
  const result = traceLettinRead('layout workspace', read);
  expect(read).toHaveBeenCalledTimes(1);
  expect(info.mock.calls).toEqual([
    ['[lettin-read]', 'layout workspace', 'started'],
  ]);
  held.resolve(value);
  expect(await result).toBe(value);
  expect(info.mock.calls[1]).toEqual([
    '[lettin-read]',
    'layout workspace',
    'completed',
    { elapsedMs: expect.any(Number) },
  ]);
  expect(read).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(info.mock.calls)).not.toContain(value.privateValue);
});
