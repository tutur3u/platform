import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

export async function verifyMemoryPostgrestBoundary({
  request,
  database,
  anon,
}) {
  const accept = (path, profile) =>
    request(path, { acceptProfile: profile, contentProfile: null });
  const post = (path, profile, bearer) =>
    request(path, {
      body: {},
      acceptProfile: null,
      contentProfile: profile,
      bearer,
    });
  const expectStatus = async (response, status) =>
    assert.equal((await response).status, status);

  await expectStatus(accept('http_request_queue', 'net'), 406);
  await expectStatus(post('rpc/reserve', 'net'), 406);
  await expectStatus(accept('memories', 'memory_storage'), 406);
  await expectStatus(post('memories', 'memory_storage'), 406);
  await expectStatus(accept('buckets', 'storage'), 403);
  await expectStatus(post('buckets', 'storage'), 403);

  database(`
    create function net.reserve() returns integer
      language sql as 'select 1';
    create function memory_api.fixture_denied() returns integer
      language sql as 'select 1';
    create table memory_api.fixture_denied (id integer);
    grant select, insert on memory_api.fixture_denied to memory_rpc;
    alter role authenticator set pgrst.db_schemas = 'public,graphql_public,storage,private,memory_api,net';
    notify pgrst, 'reload config';
    notify pgrst, 'reload schema';
  `);
  try {
    let visible;
    for (let attempt = 0; attempt < 30; attempt++) {
      visible = await post('rpc/reserve', 'net', anon);
      if (visible.status === 200) break;
      await delay(100);
    }
    assert.deepEqual(visible, { status: 200, value: 1 });
    for (const response of [
      await post('rpc/reserve', 'net'),
      await accept('http_request_queue', 'net'),
      await post('rpc/fixture_denied', 'memory_api'),
      await accept('fixture_denied', 'memory_api'),
      await post('fixture_denied', 'memory_api'),
    ]) {
      assert.equal(response.status, 403);
      assert.equal(response.value?.message, 'memory route denied');
    }
  } finally {
    database(`
      alter role authenticator reset pgrst.db_schemas;
      drop function net.reserve();
      drop function memory_api.fixture_denied();
      drop table memory_api.fixture_denied;
      notify pgrst, 'reload config';
      notify pgrst, 'reload schema';
    `);
  }
}
