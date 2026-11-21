import { describe, expect, it, vi } from 'vitest';
import {
  TRUSTED_TYPES_APP_BASE_GLOBAL,
  TRUSTED_TYPES_BOOTSTRAP,
  TRUSTED_TYPES_DIRECTIVES,
  trustedTypesBootstrap,
} from '../core/csp';
import { APP_BASE_GLOBAL } from '../core/app-url';
import { appBaseHeadScript, trustedTypesHeadScript } from './base-path';
import { createBridgeRootRoute } from './page-route';

type Rules = {
  createHTML(value: string): string;
  createScriptURL(value: string): string;
  createScript(value: string): string;
};

const BASE_SCRIPT = 'globalThis.__tuturuuuAppBase="/admin";';

function register(
  existing?: object,
  base: string | null = '/admin',
  scriptUrls: readonly string[] = []
) {
  const createPolicy = vi.fn((_name: string, rules: Rules) => rules);
  const trustedTypes = { defaultPolicy: existing, createPolicy };
  new Function(
    'globalThis',
    'document',
    'location',
    trustedTypesBootstrap(scriptUrls).replace(
      'globalThis.trustedTypes',
      'globalThis.t'
    )
  )(
    { t: trustedTypes, [APP_BASE_GLOBAL]: base },
    {
      baseURI: 'https://tuturuuu.com/admin/internal',
      currentScript: { nonce: 'n0', text: TRUSTED_TYPES_BOOTSTRAP },
      // Never consulted: the policy learns nothing from the DOM.
      scripts: [{ nonce: 'injected', text: 'alert(1)' }],
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

  it('admits only the two head scripts the server renders', () => {
    const rules = rulesOf(register());
    expect(rules.createScript(BASE_SCRIPT)).toBe(BASE_SCRIPT);
    expect(rules.createScript(TRUSTED_TYPES_BOOTSTRAP)).toBe(
      TRUSTED_TYPES_BOOTSTRAP
    );
    // Text from markup carrying any nonce is refused.
    expect(() => rules.createScript('alert(1)')).toThrow(TypeError);
    expect(() =>
      rules.createScript('globalThis.__tuturuuuAppBase="/learn";')
    ).toThrow(TypeError);
  });

  it('matches the app-base script for every published base', () => {
    for (const [base, published] of [
      ['/admin', '/admin'],
      ['', ''],
      [null, ''],
      ['/a</script>', '/a</script>'],
    ] as const) {
      const text = appBaseHeadScript(published).children;
      expect(rulesOf(register(undefined, base)).createScript(text)).toBe(text);
    }
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

  it('puts the policy after the base script only when asked', () => {
    const scripts = (options?: { trustedTypes?: boolean }) =>
      createBridgeRootRoute(options)
        .head()
        .scripts.map((s) => s.children);
    // The policy reads the app base, so the base script runs first.
    expect(scripts({ trustedTypes: true })[1]).toBe(TRUSTED_TYPES_BOOTSTRAP);
    expect(scripts()).not.toContain(TRUSTED_TYPES_BOOTSTRAP);
  });
});

it('admits only explicitly configured external script URLs', () => {
  const allowed =
    'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback&render=explicit';
  const rules = rulesOf(register(undefined, '/forms', [allowed]));
  expect(rules.createScriptURL(allowed)).toBe(allowed);
  for (const denied of [
    allowed + '&extra=1',
    allowed.replace('challenges.cloudflare.com', 'evil.example'),
    allowed.replace('api.js?', 'other.js?'),
  ]) {
    expect(() => rules.createScriptURL(denied)).toThrow();
  }
  const route = createBridgeRootRoute({
    trustedTypes: { scriptUrls: [allowed] },
  });
  expect(route.head().scripts[1]?.children).toBe(
    trustedTypesBootstrap([allowed])
  );
});
