export const main = `import text from './message.txt';
import wasm from './empty.wasm';
export class Counter {
  constructor(state) { this.state = state; }
  async fetch() {
    const n = (await this.state.storage.get('n') ?? 0) + 1;
    await this.state.storage.put('n', n);
    return new Response(String(n));
  }
}
export default { async fetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/asset') return env.ASSETS.fetch(new Request('https://fixture.invalid/hello.txt'));
  if (url.pathname === '/asset-miss') return env.ASSETS.fetch(new Request('https://fixture.invalid/absent.txt'));
  if (url.pathname === '/asset-traversal') return env.ASSETS.fetch(new Request('https://fixture.invalid/%2e%2e/wrangler.json'));
  if (url.pathname === '/service') return env.SERVICE.fetch(request);
  if (url.pathname === '/deny') return fetch('https://unadmitted.invalid/provider');
  if (url.pathname === '/do') return env.COUNTER.get(env.COUNTER.idFromName('same')).fetch(request);
  const lazy = await import('./lazy.mjs');
  return Response.json({ text, lazy: lazy.value, wasm: new WebAssembly.Instance(wasm).exports,
    host: url.host, sha: '5409c0a3704a29547c5a3cebf95df6b015b657f4',
    compiled: env.COMPILED_SHA, value: env.VALUE, secret: env.SECRET });
} };
//# sourceURL=annotation-only-0000000000000000000000000000000000000000.mjs`;
export function boundaryEntry(imports, expression) {
  return `${imports}\n${main.replace(
    '  const url = new URL(request.url);',
    `  const url = new URL(request.url);\n  if (url.pathname === '/boundary') return new Response(${expression});`
  )}`;
}
export const graphEntry = (specifier) =>
  boundaryEntry(
    `import { value as boundaryValue } from '${specifier}';`,
    'boundaryValue'
  );
export const nodeEntry = boundaryEntry(
  "import fs from 'node:fs';",
  'typeof fs.readFile'
);
