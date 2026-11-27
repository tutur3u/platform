import type { Provider } from '../types';

export function driverToProvider(driver: unknown): Provider | undefined {
  if (driver === 'acpRegistry_github_copilot' || driver === 'copilot')
    return 'copilot';
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
  if (provider === 'claude') return 'claudeAgent';
  if (provider === 'copilot') return 'acpRegistry_github_copilot';
  return provider;
}
