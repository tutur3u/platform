import type { Provider } from '../types';

export function driverToProvider(driver: unknown): Provider | undefined {
  if (driver === 'claudeAgent' || driver === 'claude') return 'claude';
  if (
    driver === 'codex' ||
    driver === 'antigravity' ||
    driver === 'grok' ||
    driver === 'cursor' ||
    driver === 'opencode'
  )
    return driver;
  return undefined;
}

export function providerToDriver(provider: Provider): string {
  return provider === 'claude' ? 'claudeAgent' : provider;
}
