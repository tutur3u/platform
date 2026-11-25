import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isSpeculativeRequest,
  refuseSpeculativeRequest,
  SPECULATION_RULES,
  SPECULATION_RULES_TEXT,
} from './speculation-rules';

const request = (headers: Record<string, string> = {}) =>
  new Request('https://tuturuuu.com/calendar', { headers });

describe('speculation rules', () => {
  it('prefetches same-tab app-launcher links on hover only', () => {
    const [rule] = SPECULATION_RULES.prefetch;
    expect(rule.eagerness).toBe('moderate');
    expect(rule.where.and[0]).toEqual({
      selector_matches: 'a[data-app-slug]:not([target]):not([data-current])',
    });
    expect(JSON.parse(SPECULATION_RULES_TEXT)).toEqual(SPECULATION_RULES);
    expect(SPECULATION_RULES).not.toHaveProperty('prerender');
  });

  it('never prefetches routes with side effects or credentials in flight', () => {
    const excluded = SPECULATION_RULES.prefetch[0].where.and
      .filter((clause) => 'not' in clause)
      .map((clause) => ('not' in clause ? clause.not.href_matches : ''));
    expect(excluded).toEqual(
      expect.arrayContaining([
        '/api/*',
        '/*/api/*',
        '/*/_serverFn/*',
        '/*logout*',
        '/*login*',
        '/*verify-token*',
        '/*auth/callback*',
      ])
    );
  });

  it('recognizes prefetch and prerender purposes', () => {
    expect(isSpeculativeRequest(request({ 'Sec-Purpose': 'prefetch' }))).toBe(
      true
    );
    expect(
      isSpeculativeRequest(request({ 'Sec-Purpose': 'prefetch;prerender' }))
    ).toBe(true);
    expect(isSpeculativeRequest(request({ Purpose: 'prefetch' }))).toBe(true);
    expect(isSpeculativeRequest(request())).toBe(false);
    expect(
      isSpeculativeRequest(request({ 'Sec-Purpose': 'prefetching' }))
    ).toBe(false);
  });

  it('refuses speculative requests only while the stop fence is on', () => {
    const prefetch = request({ 'Sec-Purpose': 'prefetch' });
    expect(refuseSpeculativeRequest(prefetch, {})).toBeNull();
    expect(
      refuseSpeculativeRequest(prefetch, { TUTURUUU_SPECULATION_RULES: 'on' })
    ).toBeNull();
    expect(
      refuseSpeculativeRequest(request(), {
        TUTURUUU_SPECULATION_RULES: 'off',
      })
    ).toBeNull();

    const refused = refuseSpeculativeRequest(prefetch, {
      TUTURUUU_SPECULATION_RULES: ' OFF ',
    });
    expect(refused?.status).toBe(503);
    expect(refused?.headers.get('Cache-Control')).toBe('no-store');
  });
});

const REQUEST_STORE = Symbol.for('tuturuuu.start-bridge.request-context');
type Global = Record<PropertyKey, unknown>;

function withRequestEnv(env: Record<string, string>, nonce?: string) {
  (globalThis as Global)[REQUEST_STORE] = {
    getStore: () => ({ nonce, cloudflare: { env } }),
  };
}

describe('speculation rules rendering', () => {
  afterEach(() => {
    delete (globalThis as Global)[REQUEST_STORE];
    delete (globalThis as Global).document;
    vi.resetModules();
  });

  it('renders the rules unless the request environment turns them off', async () => {
    const { speculationRulesHeadScripts } = await import('../start/base-path');
    withRequestEnv({}, 'nonce-1');
    expect(speculationRulesHeadScripts()).toEqual([
      {
        type: 'speculationrules',
        'data-tuturuuu-speculation': '',
        children: SPECULATION_RULES_TEXT,
        nonce: 'nonce-1',
      },
    ]);

    withRequestEnv({ TUTURUUU_SPECULATION_RULES: 'off' });
    expect(speculationRulesHeadScripts()).toEqual([]);
  });

  it('keeps server-rendered rules in the browser after hydration', async () => {
    const querySelector = vi.fn(() => ({}) as never);
    (globalThis as Global).document = { querySelector };
    const { speculationRulesEnabled } = await import('./speculation-rules');

    expect(speculationRulesEnabled()).toBe(true);
    querySelector.mockReturnValue(null as never);
    expect(speculationRulesEnabled()).toBe(true);
  });

  it('keeps the server decision in the browser after hydration', async () => {
    const querySelector = vi.fn(() => null);
    (globalThis as Global).document = { querySelector };
    const { speculationRulesEnabled } = await import('./speculation-rules');

    expect(speculationRulesEnabled()).toBe(false);
    querySelector.mockReturnValue({} as never);
    // A later head evaluation never adds rules the server withheld.
    expect(speculationRulesEnabled()).toBe(false);
    expect(querySelector).toHaveBeenCalledOnce();
    expect(querySelector).toHaveBeenCalledWith(
      'script[type="speculationrules"][data-tuturuuu-speculation]'
    );
  });
});
