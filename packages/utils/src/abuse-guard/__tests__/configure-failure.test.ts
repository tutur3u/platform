// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  configureAbuseGuardRuntime,
  isAbuseGuardFamilyAssigned,
  selectAbuseGuard,
} from '../select';

const PEPPER = 'p'.repeat(40);

afterEach(() => {
  configureAbuseGuardRuntime(null);
  vi.restoreAllMocks();
});

describe('configureAbuseGuardRuntime failures', () => {
  it('never throws: assigned families turn off instead of failing every request', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const input = {
      binding: { run: vi.fn() },
      get pepper(): string {
        throw new Error('secret 1234 unavailable');
      },
      families: 'proxy',
    };
    expect(() => configureAbuseGuardRuntime(input)).not.toThrow();
    expect(selectAbuseGuard('proxy', {})).toEqual({ kind: 'off' });
    expect(isAbuseGuardFamilyAssigned('proxy', {})).toBe(true);
    expect(selectAbuseGuard('offline', {})).toEqual({ kind: 'legacy' });
    // Reported once per isolate, without the message.
    expect(() => configureAbuseGuardRuntime(input)).not.toThrow();
    const alerts = error.mock.calls.filter((args) =>
      String(args[0]).includes('abuse-guard-configure-failed')
    );
    expect(alerts).toHaveLength(1);
    expect(JSON.stringify(error.mock.calls)).not.toContain('1234');
  });

  it('contains a logger that throws while reporting', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('log sink down');
    });
    expect(() =>
      configureAbuseGuardRuntime({
        binding: { run: vi.fn() },
        get pepper(): string {
          throw new Error('unavailable');
        },
        families: 'proxy',
      })
    ).not.toThrow();
    expect(selectAbuseGuard('proxy', {})).toEqual({ kind: 'off' });
  });

  it('reports again after a recovery', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = () => ({
      binding: { run: vi.fn() },
      get pepper(): string {
        throw new Error('unavailable');
      },
      families: 'proxy',
    });
    configureAbuseGuardRuntime(failing());
    configureAbuseGuardRuntime({
      binding: { run: vi.fn() },
      pepper: PEPPER,
      families: 'proxy',
    });
    configureAbuseGuardRuntime(failing());
    const alerts = error.mock.calls.filter((args) =>
      String(args[0]).includes('abuse-guard-configure-failed')
    );
    expect(alerts).toHaveLength(2);
  });

  it('turns every family off when the family list is not a string', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      configureAbuseGuardRuntime({
        binding: { run: vi.fn() },
        pepper: PEPPER,
        families: ['replay', 'proxy'] as unknown as string,
      })
    ).not.toThrow();
    expect(selectAbuseGuard('replay', {})).toEqual({ kind: 'off' });
    expect(selectAbuseGuard('offline', {})).toEqual({ kind: 'off' });
  });

  it('fails closed over a working configuration, then recovers', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const run = vi.fn();
    configureAbuseGuardRuntime({
      binding: { run },
      pepper: PEPPER,
      families: 'proxy',
    });
    expect(selectAbuseGuard('proxy', {}).kind).toBe('durable-object');
    configureAbuseGuardRuntime({
      binding: { run },
      get pepper(): string {
        throw new Error('unavailable');
      },
      families: 'proxy',
    });
    // Fails closed for the assigned family; recovers on the next good input.
    expect(selectAbuseGuard('proxy', {})).toEqual({ kind: 'off' });
    configureAbuseGuardRuntime({
      binding: { run },
      pepper: PEPPER,
      families: 'proxy',
    });
    expect(selectAbuseGuard('proxy', {}).kind).toBe('durable-object');
  });

  it('never derives anything from the binding while no family is assigned', () => {
    const binding = new Proxy(
      {},
      {
        get() {
          throw new Error('binding touched');
        },
      }
    );
    const input = {
      binding: binding as never,
      get pepper(): string {
        throw new Error('pepper read without an assigned family');
      },
      families: '',
    };
    expect(() => configureAbuseGuardRuntime(input)).not.toThrow();
    expect(() => configureAbuseGuardRuntime(input)).not.toThrow();
    expect(selectAbuseGuard('proxy', {})).toEqual({ kind: 'legacy' });
  });
});
