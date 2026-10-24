// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ redis: vi.fn() }));
vi.mock('./store', () => ({
  configuredNativeIntegrityRedis: mocks.redis,
  createNativeIntegrityStore: vi.fn(),
}));

import {
  nativeIntegrityMode,
  nativeIntegrityRuntime,
  nativeIntegrityTurnstileParents,
  nativeIntegrityWebOrigin,
} from './runtime';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it('defaults to off and does not construct a store or provider runtime', () => {
  vi.stubEnv('NATIVE_INTEGRITY_MODE', '');
  expect(nativeIntegrityMode()).toBe('off');
  expect(nativeIntegrityRuntime('actor')).toBeNull();
  vi.stubEnv('NATIVE_INTEGRITY_MODE', 'typo-enforce');
  expect(nativeIntegrityRuntime('actor')).toBeNull();
  expect(mocks.redis).not.toHaveBeenCalled();
});
it('accepts only explicitly enabled rollout modes', () => {
  vi.stubEnv('NATIVE_INTEGRITY_MODE', 'monitor');
  expect(nativeIntegrityMode()).toBe('monitor');
  vi.stubEnv('NATIVE_INTEGRITY_MODE', 'enforce');
  expect(nativeIntegrityMode()).toBe('enforce');
});
it('locks bridge origins to canonical HTTPS configuration and explicit parent origins', () => {
  vi.stubEnv('NATIVE_INTEGRITY_WEB_ORIGIN', 'https://tuturuuu.com');
  vi.stubEnv(
    'NATIVE_INTEGRITY_TURNSTILE_PARENT_ORIGINS',
    'https://mobile.example'
  );
  expect(nativeIntegrityTurnstileParents()).toEqual([
    'https://tuturuuu.com',
    'https://mobile.example',
  ]);
  vi.stubEnv(
    'NATIVE_INTEGRITY_TURNSTILE_PARENT_ORIGINS',
    'https://mobile.example/other'
  );
  expect(() => nativeIntegrityTurnstileParents()).toThrow();
  vi.stubEnv('NATIVE_INTEGRITY_WEB_ORIGIN', 'https://tuturuuu.com/');
  expect(() => nativeIntegrityWebOrigin()).toThrow();
});
