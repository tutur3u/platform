import { describe, expect, it } from 'vitest';
import {
  type ExecutableFs,
  trustedSystemExecutable,
} from './resources-command';

// In-memory filesystem layouts. Entries are files or directories with owner
// and mode; `link` makes a symlink resolved by realpath.
type Entry = { uid?: number; mode?: number; dir?: boolean; link?: string };
function layout(entries: Record<string, Entry>): ExecutableFs {
  // Resolves every component, as realpath(3) does.
  const resolveLink = (path: string, depth = 0): string => {
    if (depth > 16) throw new Error('ELOOP');
    let current = '';
    const parts = path.split('/').filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      if (part === '.') continue;
      if (part === '..') {
        current = current.slice(0, current.lastIndexOf('/'));
        continue;
      }
      const next = `${current}/${part}`;
      const entry = entries[next];
      if (!entry) throw new Error(`ENOENT ${next}`);
      if (entry.link) {
        const target = entry.link.startsWith('/')
          ? entry.link
          : `${current}/${entry.link}`;
        return resolveLink(
          [target, ...parts.slice(i + 1)].join('/'),
          depth + 1
        );
      }
      current = next;
    }
    return current || '/';
  };
  return {
    executable: (path) => {
      try {
        const real = resolveLink(path);
        return (
          !entries[real]!.dir && ((entries[real]!.mode ?? 0o755) & 0o111) !== 0
        );
      } catch {
        return false;
      }
    },
    realpath: resolveLink,
    stat: (path) => {
      const entry = entries[path];
      if (!entry) throw new Error(`ENOENT ${path}`);
      return {
        uid: entry.uid ?? 0,
        mode: entry.mode ?? 0o755,
        isFile: () => !entry.dir,
      };
    },
  };
}
const dir = (extra: Entry = {}): Entry => ({ dir: true, ...extra });
// Ubuntu 25.10+: /bin -> usr/bin, /usr/bin/<tool> -> rust-coreutils applets.
const ubuntu = (overrides: Record<string, Entry> = {}) =>
  layout({
    '/': dir(),
    '/bin': { link: 'usr/bin' },
    '/usr': dir(),
    '/usr/bin': dir(),
    '/usr/lib': dir(),
    '/usr/lib/cargo': dir(),
    '/usr/lib/cargo/bin': dir(),
    '/usr/lib/cargo/bin/coreutils': dir(),
    '/usr/lib/cargo/bin/coreutils/cat': {},
    '/usr/lib/cargo/bin/coreutils/echo': {},
    '/usr/lib/cargo/bin/sudo': {},
    '/usr/bin/cat': { link: '../lib/cargo/bin/coreutils/cat' },
    '/usr/bin/echo': { link: '../lib/cargo/bin/coreutils/echo' },
    '/usr/bin/busybox': {},
    '/usr/bin/wc': { link: 'busybox' },
    '/usr/bin/nested': dir(),
    '/usr/bin/nested/head': {},
    '/usr/bin/head': { link: 'nested/head' },
    '/home': dir(),
    '/home/dev': dir({ uid: 1000 }),
    '/home/dev/bin': dir({ uid: 1000 }),
    '/home/dev/bin/cat': { uid: 1000 },
    ...overrides,
  });
const macos = layout({
  '/': dir(),
  '/bin': dir(),
  '/bin/cat': {},
  '/bin/echo': {},
  '/usr': dir(),
  '/usr/bin': dir(),
  '/usr/bin/head': {},
});
const PATH = '/usr/local/bin:/usr/bin:/bin';

describe('trusted canonical system tools on Linux (rust-coreutils)', () => {
  it('accepts a /usr/bin symlink into the coreutils applet directory and returns the canonical applet', () => {
    expect(trustedSystemExecutable('cat', PATH, ubuntu())).toBe(
      '/usr/lib/cargo/bin/coreutils/cat'
    );
    // /bin is itself a symlink to usr/bin on merged-/usr systems.
    expect(trustedSystemExecutable('/bin/echo', PATH, ubuntu())).toBe(
      '/usr/lib/cargo/bin/coreutils/echo'
    );
  });

  it('keeps the applet name: a multicall target under another name queues', () => {
    // busybox would see argv[0] "busybox", not the requested applet.
    expect(trustedSystemExecutable('wc', PATH, ubuntu())).toBeUndefined();
  });

  it('refuses canonical targets outside the exact allowlisted directories', () => {
    expect(trustedSystemExecutable('head', PATH, ubuntu())).toBeUndefined();
    expect(
      trustedSystemExecutable(
        'cat',
        PATH,
        ubuntu({ '/usr/bin/cat': { link: '../lib/cargo/bin/sudo' } })
      )
    ).toBeUndefined();
    expect(
      trustedSystemExecutable('cat', `/home/dev/bin:${PATH}`, ubuntu())
    ).toBeUndefined();
  });

  it.each([
    ['/usr/lib/cargo/bin/coreutils', dir({ mode: 0o775 })],
    ['/usr/lib/cargo', dir({ uid: 1000 })],
    ['/usr/lib/cargo/bin/coreutils/cat', { mode: 0o757 }],
    ['/', dir({ mode: 0o777 })],
  ])('refuses when %s is not root-locked', (path, entry) => {
    expect(
      trustedSystemExecutable('cat', PATH, ubuntu({ [path]: entry }))
    ).toBeUndefined();
  });
});

describe('trusted canonical system tools on macOS', () => {
  it('accepts SIP-protected /bin and /usr/bin binaries', () => {
    expect(trustedSystemExecutable('cat', PATH, macos)).toBe('/bin/cat');
    expect(trustedSystemExecutable('head', PATH, macos)).toBe('/usr/bin/head');
  });
});
