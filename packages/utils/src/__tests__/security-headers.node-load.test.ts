import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const securityHeaders = resolve(__dirname, '../security-headers.ts');

// start-bridge.config.ts (which imports this module) is loaded by plain Node
// with type stripping: by the codemod and by the native-worker runtime gate.
// Node ESM needs a file extension on relative imports, so a relative runtime
// import here makes the whole gate fail with ERR_MODULE_NOT_FOUND.
describe('security-headers loads under Node type stripping', () => {
  it('has no relative runtime imports', () => {
    const source = readFileSync(securityHeaders, 'utf8');
    expect(source).not.toMatch(/^import (?!type)[^;]*from '\.\.?\//mu);
  });

  it('loads and applies the retired-host filter in a plain Node process', () => {
    const script = `
      const m = await import(${JSON.stringify(pathToFileURL(securityHeaders).href)});
      console.log(JSON.stringify({
        retired: m.originSources('https://rewise.me', true),
        live: m.originSources('https://abcd.supabase.co'),
        apply: typeof m.applyDocumentSecurityHeaders,
      }));
    `;
    const output = execFileSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--no-warnings',
        '--input-type=module',
        '-e',
        script,
      ],
      { encoding: 'utf8' }
    );
    expect(JSON.parse(output)).toEqual({
      retired: [],
      live: ['https://abcd.supabase.co'],
      apply: 'function',
    });
  });
});
