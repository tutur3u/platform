import { spawn } from 'node:child_process';
import { platform } from 'node:os';

export interface OpenBrowserCommand {
  args: string[];
  command: string;
}

interface BrowserChild {
  once(event: 'error', listener: () => void): void;
  once(event: 'spawn', listener: () => void): void;
  unref(): void;
}

interface BrowserDependencies {
  getPlatform(): NodeJS.Platform;
  spawnProcess(
    command: string,
    args: string[],
    options: { detached: true; stdio: 'ignore' }
  ): BrowserChild;
}

export function getOpenBrowserCommand(
  targetPlatform: NodeJS.Platform,
  url: string
): OpenBrowserCommand {
  if (targetPlatform === 'darwin') {
    return { command: 'open', args: [url] };
  }

  if (targetPlatform === 'win32') {
    return { command: 'rundll32', args: ['url.dll,FileProtocolHandler', url] };
  }

  return { command: 'xdg-open', args: [url] };
}

export function openBrowserWithDependencies(
  url: string,
  dependencies: BrowserDependencies
): Promise<boolean> {
  const { command, args } = getOpenBrowserCommand(
    dependencies.getPlatform(),
    url
  );

  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: boolean) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      const child = dependencies.spawnProcess(command, args, {
        detached: true,
        stdio: 'ignore',
      });
      child.once('error', () => settle(false));
      child.once('spawn', () => settle(true));
      child.unref();
    } catch {
      settle(false);
    }
  });
}

export function openBrowser(url: string) {
  return openBrowserWithDependencies(url, {
    getPlatform: platform,
    spawnProcess: (command, args, options) => spawn(command, args, options),
  });
}
