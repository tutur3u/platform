import { describe, expect, it } from 'vitest';
import { getOpenBrowserCommand } from './browser';

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
