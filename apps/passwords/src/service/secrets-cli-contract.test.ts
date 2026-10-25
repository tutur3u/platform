import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { SecretsClient } from '../../../../packages/sdk/src/cli/secrets-client';
import { parseCredentials } from '../../../../packages/sdk/src/cli/secrets-credentials';
import { fixture } from './secrets-api-test-fixture';
import { credentials } from './secrets-protocol';

it('actual private CLI client consumes API list, put, get, rotate and original status', async () => {
  const f = await fixture();
  const file = parseCredentials(
    JSON.stringify(credentials(f.scope, f.token.token, Date.now() + 60000))
  );
  const client = new SecretsClient({
    credentials: file,
    fetch: async (url, init) => (await f.handler(new Request(url, init)))!,
  });
  expect((await client.list()).kind).toBe('ok');
  const requestId = randomUUID();
  const bytes = Buffer.from('synthetic file-only CLI round trip');
  expect((await client.put(f.name, bytes, requestId)).kind).toBe('ok');
  const read = await client.get(f.name);
  expect(read.kind).toBe('ok');
  if (read.kind === 'ok') {
    expect(read.value.bytes.equals(bytes)).toBe(true);
    read.value.bytes.fill(0);
  }
  const status = await client.status(requestId);
  expect(status).toMatchObject({
    kind: 'ok',
    value: { found: true, action: 'put', itemId: f.itemId },
  });
  expect((await client.rotate(randomUUID())).kind).toBe('ok');
  bytes.fill(0);
});

it('actual CLI classifies a lost write as UNKNOWN and reconciles without replay', async () => {
  const f = await fixture();
  f.setLoseWrite(true);
  const client = new SecretsClient({
    credentials: credentials(f.scope, f.token.token, Date.now() + 60000),
    fetch: async (url, init) => (await f.handler(new Request(url, init)))!,
  });
  const id = randomUUID();
  expect(
    (await client.put(f.name, Buffer.from('synthetic input'), id)).kind
  ).toBe('unknown');
  expect(await client.status(id)).toMatchObject({
    kind: 'ok',
    value: { found: true, action: 'put' },
  });
  expect(f.calls.filter((call) => call.action === 'upload')).toHaveLength(2);
});
