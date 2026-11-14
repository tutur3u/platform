import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientProviders } from './client-providers';

vi.mock('@tuturuuu/satellite/command-launcher', () => ({
  GlobalCommandLauncher: () => null,
}));
vi.mock('@tuturuuu/ui/hooks/use-workspace-visibility', () => ({
  WorkspaceVisibilityProvider: ({ children }: { children: unknown }) =>
    children,
}));

const REQUEST_STORE = Symbol.for('tuturuuu.start-bridge.request-context');
const globals = globalThis as { [REQUEST_STORE]?: unknown };

beforeEach(() => {
  // jsdom has no matchMedia; next-themes reads the system color scheme.
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      }) as unknown as MediaQueryList
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  globals[REQUEST_STORE] = undefined;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const page = () => (
  <ClientProviders>
    <p>learn page</p>
  </ClientProviders>
);

describe('ClientProviders in the browser', () => {
  it('never renders the nonce, even if a request store is present', () => {
    globals[REQUEST_STORE] = { getStore: () => ({ nonce: 'n0nce' }) };

    // jsdom has `window`, like the browser: next-themes emits an empty nonce.
    expect(renderToString(page())).not.toContain('n0nce');
  });

  it('hydrates server HTML whose nonce the browser hides, without mismatch', async () => {
    // Browsers expose a script's nonce attribute as empty (`nonce=""`) once
    // the script is parsed, which is what the client render produces too.
    const serverHtml = renderToString(page());
    const container = document.createElement('div');
    container.innerHTML = serverHtml;
    document.body.append(container);

    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      hydrateRoot(container, page());
    });

    expect(errors).not.toHaveBeenCalled();
    expect(container.textContent).toContain('learn page');
  });
});
