// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const script = readFileSync(
  new URL('./public/theme-bootstrap.js', import.meta.url),
  'utf8'
);
describe('existing public theme preference', () => {
  it.each(['light', 'dark'])(
    'applies stored %s without rewriting it',
    (saved) => {
      const root = { dataset: {} };
      const storage = { getItem: vi.fn(() => saved), setItem: vi.fn() };
      runInNewContext(script, {
        document: { documentElement: root },
        localStorage: storage,
      });
      expect(root.dataset).toEqual({ theme: saved });
      expect(storage.getItem).toHaveBeenCalledWith('theme');
      expect(storage.setItem).not.toHaveBeenCalled();
    }
  );
  it('retains the system theme when storage is blocked or preference is system', () => {
    for (const value of ['system', 'blocked']) {
      const root = { dataset: {} };
      const getItem = () => {
        if (value === 'blocked') throw new Error('fixture');
        return value;
      };
      runInNewContext(script, {
        document: { documentElement: root },
        localStorage: { getItem },
      });
      expect(root.dataset).toEqual({});
    }
  });
});
