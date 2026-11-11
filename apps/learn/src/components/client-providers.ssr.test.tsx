// @vitest-environment node
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

afterEach(() => {
  withRequestNonce(undefined);
});

describe('ClientProviders server render under the nonce CSP', () => {
  it('puts the request nonce on the next-themes inline script', async () => {
    withRequestNonce('n0nce');
    const html = await render();

    const scripts = html.match(/<script\b[^>]*>/gu) ?? [];
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toContain('nonce="n0nce"');
    // It is the theme bootstrap, not some other inline script.
    expect(html).toMatch(/<script[^>]*>[^<]*localStorage[^<]*<\/script>/u);
    expect(html).toContain('learn page');
  });

  it('uses the nonce of the current request, never a cached one', async () => {
    withRequestNonce('first');
    const first = await render();
    withRequestNonce('second');
    const second = await render();

    expect(first).toContain('nonce="first"');
    expect(first).not.toContain('second');
    expect(second).toContain('nonce="second"');
    expect(second).not.toContain('first');
  });

  it('emits no nonce attribute when no CSP nonce is in play', async () => {
    withRequestNonce(undefined);
    const html = await render();

    expect(html).not.toMatch(/nonce=/u);
    expect(html).toContain('learn page');
  });
});
