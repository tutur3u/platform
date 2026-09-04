import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { getOpenBrowserCommand, openBrowserWithDependencies } from './browser';

function createFakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    unref: ReturnType<typeof vi.fn>;
  };
  child.unref = vi.fn();
  return child;
}

describe('browser opener command selection', () => {
  it('uses open on macOS', () => {
    expect(getOpenBrowserCommand('darwin', 'https://tuturuuu.com')).toEqual({
      command: 'open',
      args: ['https://tuturuuu.com'],
    });
  });

  it('uses rundll32 on Windows', () => {
    expect(getOpenBrowserCommand('win32', 'https://tuturuuu.com')).toEqual({
      command: 'rundll32',
      args: ['url.dll,FileProtocolHandler', 'https://tuturuuu.com'],
    });
  });

  it('keeps Windows CLI callback URLs in one shell-free argument', () => {
    const loginUrl =
      'https://tuturuuu.com/api/cli/auth/start?state=abc&redirect_uri=http%3A%2F%2F127.0.0.1%3A51735%2Fcallback';

    expect(getOpenBrowserCommand('win32', loginUrl)).toEqual({
      command: 'rundll32',
      args: ['url.dll,FileProtocolHandler', loginUrl],
    });
  });

  it('uses xdg-open on Linux', () => {
    expect(getOpenBrowserCommand('linux', 'https://tuturuuu.com')).toEqual({
      command: 'xdg-open',
      args: ['https://tuturuuu.com'],
    });
  });
});

describe('browser opener lifecycle', () => {
  it('resolves true only after the child spawns', async () => {
    const child = createFakeChild();
    const spawnProcess = vi.fn(() => child);

    const result = openBrowserWithDependencies('https://tuturuuu.com', {
      getPlatform: () => 'linux',
      spawnProcess,
    });

    expect(spawnProcess).toHaveBeenCalledWith(
      'xdg-open',
      ['https://tuturuuu.com'],
      { detached: true, stdio: 'ignore' }
    );
    expect(child.unref).toHaveBeenCalledOnce();

    child.emit('spawn');

    await expect(result).resolves.toBe(true);
  });

  it('resolves false when the child reports an asynchronous error', async () => {
    const child = createFakeChild();

    const result = openBrowserWithDependencies('https://tuturuuu.com', {
      getPlatform: () => 'darwin',
      spawnProcess: () => child,
    });

    child.emit('error', new Error('open is unavailable'));

    await expect(result).resolves.toBe(false);
  });

  it('resolves false when spawning throws synchronously', async () => {
    const result = openBrowserWithDependencies('https://tuturuuu.com', {
      getPlatform: () => 'win32',
      spawnProcess: () => {
        throw new Error('spawn failed');
      },
    });

    await expect(result).resolves.toBe(false);
  });

  it('ignores an error emitted after successful settlement', async () => {
    const child = createFakeChild();

    const result = openBrowserWithDependencies('https://tuturuuu.com', {
      getPlatform: () => 'linux',
      spawnProcess: () => child,
    });

    child.emit('spawn');
    await expect(result).resolves.toBe(true);

    expect(() => child.emit('error', new Error('late failure'))).not.toThrow();
  });
});
