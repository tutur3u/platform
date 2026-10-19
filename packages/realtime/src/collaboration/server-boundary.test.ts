import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as publicApi from './index';
import * as serverApi from './server';

function closureErrors(injected?: string) {
  const seen = new Set<string>();
  const errors: string[] = [];
  function visit(file: URL) {
    if (seen.has(file.href)) return;
    seen.add(file.href);
    const source =
      injected && file.pathname.endsWith('/server.ts')
        ? injected
        : readFileSync(file, 'utf8');
    if (file.pathname.endsWith('/client.ts')) errors.push('browser client');
    for (const match of source.matchAll(
      /(?:from\s*|import\s*)['"]([^'"]+)['"]/g
    )) {
      const specifier = match[1];
      if (!specifier) throw new Error('Missing module specifier');
      if (specifier.startsWith('.')) visit(new URL(`${specifier}.ts`, file));
      else if (!['zod', 'yjs'].includes(specifier)) errors.push(specifier);
    }
    if (
      /\b(?:window|document|WebSocket|Request|Response|localStorage)\s*[.(]/.test(
        source
      )
    )
      errors.push(`host global: ${fileURLToPath(file)}`);
  }
  visit(new URL('./server.ts', import.meta.url));
  return errors;
}

describe('portable collaboration server entry', () => {
  it('retains every server API through the existing public barrel and client export', () => {
    for (const key of Object.keys(serverApi))
      expect(Reflect.get(publicApi, key)).toBe(Reflect.get(serverApi, key));
    expect(publicApi.ProgrammingCollaborationClient).toBeTypeOf('function');
    const pkg = z
      .object({ exports: z.record(z.string(), z.string()) })
      .parse(
        JSON.parse(
          readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
        )
      );
    expect(pkg.exports['./collaboration/server']).toBe(
      './src/collaboration/server.ts'
    );
  });

  it('keeps the complete local server import closure free of browser/framework hosts', () => {
    expect(closureErrors()).toEqual([]);
    const source = readFileSync(
      new URL('./server.ts', import.meta.url),
      'utf8'
    );
    expect(
      closureErrors(
        `${source}\nexport { ProgrammingCollaborationClient } from './client';`
      )
    ).toContain('browser client');
  });
});
