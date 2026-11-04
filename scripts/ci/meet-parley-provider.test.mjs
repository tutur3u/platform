import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';

const proxySource = stripTypeScriptTypes(
  readFileSync(
    new URL(
      '../../packages/meet-core/src/cloudflare/provider-proxy.ts',
      import.meta.url
    ),
    'utf8'
  )
);
const { proxyMeetingProvider } = await import(
  `data:text/javascript,${encodeURIComponent(proxySource)}`
);
const entrySource = stripTypeScriptTypes(
  readFileSync(
    new URL('../../apps/meet/cloudflare/provider.ts', import.meta.url),
    'utf8'
  )
)
  .replace(/^import .*;$/gm, '')
  .replace('export class MeetingAIProvider', 'class MeetingAIProvider');
class Entrypoint {
  constructor(env) {
    this.env = env;
  }
}
const Provider = new Function(
  'WorkerEntrypoint',
  'proxyMeetingProvider',
  `${entrySource}; return MeetingAIProvider;`
)(Entrypoint, proxyMeetingProvider);
const request = () =>
  new Request(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    { method: 'POST', body: '{}' }
  );
test('Meet key alone cannot authorize Parley provider traffic', async () => {
  const provider = new Provider({
    GOOGLE_GENERATIVE_AI_API_KEY: 'meet-fixture',
  });
  assert.equal((await provider.fetch(request())).status, 503);
});
test('Parley provider sends only its dedicated credential', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(init.headers['x-goog-api-key']);
    return new Response('{}');
  };
  try {
    const provider = new Provider({
      GOOGLE_GENERATIVE_AI_API_KEY: 'meet-fixture',
      PARLEY_GOOGLE_GENERATIVE_AI_API_KEY: 'parley-fixture',
    });
    assert.equal((await provider.fetch(request())).status, 200);
    assert.deepEqual(calls, ['parley-fixture']);
  } finally {
    globalThis.fetch = original;
  }
});
