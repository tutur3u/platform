import { describe, expect, it } from 'vitest';
import { resolveCommandHost, resolveLaunchableHostApp } from './command-host';

describe('satellite command host resolution', () => {
  it('resolves launchable apps from provider titles', () => {
    expect(resolveLaunchableHostApp('Tuturuuu Finance')).toBe('finance');
    expect(resolveLaunchableHostApp('Tuturuuu Calendar')).toBe('calendar');
  });

  it('gives Tools and Infrastructure a launcher without tracking them as apps', () => {
    expect(resolveLaunchableHostApp('Tuturuuu QR')).toBeUndefined();
    expect(resolveCommandHost('Tuturuuu QR', undefined)).toBe('tools');
    expect(resolveLaunchableHostApp('Tuturuuu Infra')).toBeUndefined();
    expect(resolveCommandHost('Tuturuuu Infra', undefined)).toBe('external');
  });

  it('prefers the explicit current app', () => {
    expect(resolveCommandHost('Tuturuuu QR', 'ai')).toBe('ai');
  });

  it('mounts nothing for an unknown host', () => {
    expect(resolveCommandHost('Unknown', undefined)).toBeUndefined();
  });
});
