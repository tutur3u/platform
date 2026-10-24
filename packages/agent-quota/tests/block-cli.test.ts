import { expect, it, vi } from 'vitest';
import { runBlock } from '../src/block-cli';

it('returns malformed exit 2 for block arguments and does not write a block', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const previous = process.exitCode;
  try {
    await runBlock(['--pool', 'antigravity', '--model-scope']);
    expect(process.exitCode).toBe(2);
    expect(String(log.mock.calls[0]?.[0])).toContain('block-arguments-invalid');
  } finally {
    process.exitCode = previous;
    log.mockRestore();
  }
});
