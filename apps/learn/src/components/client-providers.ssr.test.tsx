// @vitest-environment node
import { createRequire } from 'node:module';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/satellite/command-launcher', () => ({
  GlobalCommandLauncher: () => null,
}));
vi.mock('@tuturuuu/ui/hooks/use-workspace-visibility', () => ({
  WorkspaceVisibilityProvider: ({ children }: { children: unknown }) =>
    children,
}));

// Where the Worker handler keeps the per-request nonce (see
// `requestNonce()` in @tuturuuu/start-bridge/csp).
const REQUEST_STORE = Symbol.for('tuturuuu.start-bridge.request-context');
const globals = globalThis as { [REQUEST_STORE]?: unknown };

function withRequestNonce(nonce: string | undefined) {
  globals[REQUEST_STORE] = nonce ? { getStore: () => ({ nonce }) } : undefined;
}

async function render() {
  const { ClientProviders } = await import('./client-providers');
  return renderToString(
    <ClientProviders>
      <p>learn page</p>
    </ClientProviders>
  );
}

// jsdom is a devDependency without bundled types; only its HTML parser is used.
const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (html: string) => { window: { document: Document } };
};

// Inspect the markup with an HTML parser, not a regexp: tag names are matched
// case-insensitively and attribute quoting is handled the way a browser does.
function scriptsOf(html: string) {
  const { document } = new JSDOM(html).window;
  return [...document.querySelectorAll('script')];
}

afterEach(() => {
  withRequestNonce(undefined);
});

describe('ClientProviders server render under the nonce CSP', () => {
  it('puts the request nonce on the next-themes inline script', async () => {
    withRequestNonce('n0nce');
    const html = await render();

    const scripts = scriptsOf(html);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.getAttribute('nonce')).toBe('n0nce');
    // It is the theme bootstrap, not some other inline script.
    expect(scripts[0]?.textContent).toContain('localStorage');
    expect(html).toContain('learn page');
  });

  it('uses the nonce of the current request, never a cached one', async () => {
    withRequestNonce('first');
    const first = scriptsOf(await render());
    withRequestNonce('second');
    const second = scriptsOf(await render());

    expect(first.map((script) => script.getAttribute('nonce'))).toEqual([
      'first',
    ]);
    expect(second.map((script) => script.getAttribute('nonce'))).toEqual([
      'second',
    ]);
  });

  it('emits no nonce attribute when no CSP nonce is in play', async () => {
    withRequestNonce(undefined);
    const html = await render();

    const scripts = scriptsOf(html);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.hasAttribute('nonce')).toBe(false);
    expect(html).toContain('learn page');
  });

  it('finds scripts whatever the case of the tag', () => {
    expect(
      scriptsOf('<SCRIPT nonce="up">1</SCRIPT><ScRiPt>2</ScRiPt>').map(
        (script) => script.getAttribute('nonce')
      )
    ).toEqual(['up', null]);
  });
});
