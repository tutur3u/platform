import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('highlightCode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('highlights every docs language without runtime WebAssembly', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    // Mirror the Workers runtime, which rejects runtime Wasm compilation.
    vi.spyOn(WebAssembly, 'instantiate').mockRejectedValue(
      new Error('Wasm code generation disallowed by embedder')
    );
    vi.spyOn(WebAssembly, 'compile').mockRejectedValue(
      new Error('Wasm code generation disallowed by embedder')
    );
    const { highlightCode } = await import('./shiki');

    for (const [code, lang] of [
      ['const a: number = 1;', 'tsx'],
      ['const a: number = 1;', 'ts'],
      ['bun install', 'bash'],
      ['{"a": 1}', 'json'],
    ] as const) {
      const html = await highlightCode(code, lang);
      expect(html).toContain('class="shiki');
      expect(html).toContain('--shiki-dark');
    }
  });

  it('falls back to escaped plain code when the highlighter fails', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.doMock('shiki/core', () => ({
      createHighlighterCore: () => Promise.reject(new Error('load failed')),
    }));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { highlightCode } = await import('./shiki');

    await expect(highlightCode('<a>&</a>')).resolves.toBe(
      '<pre><code>&lt;a&gt;&amp;&lt;/a&gt;</code></pre>'
    );
    expect(error).toHaveBeenCalledTimes(1);
    vi.doUnmock('shiki/core');
  });

  it('keeps Shiki off runtime WebAssembly compilation', () => {
    // Workers forbid runtime Wasm compilation, so the default Oniguruma
    // engine (onig.wasm) fails every docs render in production.
    const source = readFileSync(new URL('./shiki.ts', import.meta.url), 'utf8');
    expect(source).toContain("import('shiki/engine/javascript')");
    expect(source).toContain('createJavaScriptRegexEngine()');
    expect(source).not.toContain("import('shiki')");
    expect(source).not.toContain('engine/oniguruma');
    expect(source).not.toContain('shiki/wasm');
  });
});
