import { describe, expect, it, vi } from 'vitest';
import {
  TRUSTED_TYPES_APP_BASE_GLOBAL,
  TRUSTED_TYPES_BOOTSTRAP,
  TRUSTED_TYPES_DIRECTIVES,
} from '../core/csp';
import { APP_BASE_GLOBAL } from '../core/app-url';
import { trustedTypesHeadScript } from './base-path';
import { createBridgeRootRoute } from './page-route';

type Rules = {
  createHTML(value: string): string;
  createScriptURL(value: string): string;
  createScript(value: string): string;
};

function register(existing?: object, base = '/admin') {
  const createPolicy = vi.fn((_name: string, rules: Rules) => rules);
  const trustedTypes = { defaultPolicy: existing, createPolicy };
  new Function(
    'globalThis',
    'document',
    'location',
    TRUSTED_TYPES_BOOTSTRAP.replace('globalThis.trustedTypes', 'globalThis.t')
  )(
    { t: trustedTypes, [APP_BASE_GLOBAL]: base },
    {
      baseURI: 'https://tuturuuu.com/admin/internal',
      scripts: [
        { nonce: '', text: 'unstamped()' },
        { nonce: 'n0', text: 'globalThis.__tuturuuuAppBase="/admin";' },
      ],
    },
    { origin: 'https://tuturuuu.com' }
  );
  return createPolicy;
}

const rulesOf = (createPolicy: ReturnType<typeof register>) =>
  (createPolicy.mock.calls[0] as [string, Rules])[1];

describe('Trusted Types bootstrap', () => {
  it('reads the app base from the app-base global', () => {
    expect(TRUSTED_TYPES_APP_BASE_GLOBAL).toBe(APP_BASE_GLOBAL);
  });

  it('requires Trusted Types and allows only the default policy', () => {
    expect(TRUSTED_TYPES_DIRECTIVES).toBe(
      "require-trusted-types-for 'script'; trusted-types default"
    );
  });

  it('registers a default policy that passes HTML and same-origin script URLs', () => {
    const createPolicy = register();
    expect(createPolicy).toHaveBeenCalledOnce();
    const [name, rules] = createPolicy.mock.calls[0] as [string, Rules];
    expect(name).toBe('default');
    expect(rules.createHTML('<b>x</b>')).toBe('<b>x</b>');
    expect(rules.createScriptURL('/admin/assets/a.js')).toBe(
      'https://tuturuuu.com/admin/assets/a.js'
    );
  });

  it('refuses script URLs outside the app base or origin', () => {
    const rules = rulesOf(register());
    expect(() => rules.createScriptURL('https://evil.example/x.js')).toThrow(
      TypeError
    );
    expect(() => rules.createScriptURL('/learn/assets/x.js')).toThrow(
      TypeError
    );
    expect(() => rules.createScriptURL('/administrator/x.js')).toThrow(
      TypeError
    );
    expect(rulesOf(register(undefined, '')).createScriptURL('/x.js')).toBe(
      'https://tuturuuu.com/x.js'
    );
  });

  it('admits only script text the server sent with the nonce', () => {
    const rules = rulesOf(register());
    expect(rules.createScript('globalThis.__tuturuuuAppBase="/admin";')).toBe(
      'globalThis.__tuturuuuAppBase="/admin";'
    );
    expect(() => rules.createScript('unstamped()')).toThrow(TypeError);
    expect(() => rules.createScript('alert(1)')).toThrow(TypeError);
  });

  it('keeps an existing default policy', () => {
    expect(register({})).not.toHaveBeenCalled();
  });

  it('stamps the request nonce on the head script', () => {
    expect(trustedTypesHeadScript('abc')).toEqual({
      children: TRUSTED_TYPES_BOOTSTRAP,
      nonce: 'abc',
    });
  });

  it('puts the policy before the base script only when asked', () => {
    const scripts = (options?: { trustedTypes?: boolean }) =>
      createBridgeRootRoute(options)
        .head()
        .scripts.map((s) => s.children);
    expect(scripts({ trustedTypes: true })[0]).toBe(TRUSTED_TYPES_BOOTSTRAP);
    expect(scripts()).not.toContain(TRUSTED_TYPES_BOOTSTRAP);
  });
});
