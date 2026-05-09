import { spawn } from 'node:child_process';
import { platform } from 'node:os';

export interface OpenBrowserCommand {
  args: string[];
  command: string;
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

export async function openBrowser(url: string) {
  const { command, args } = getOpenBrowserCommand(platform(), url);

  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}
