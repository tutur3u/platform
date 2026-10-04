const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const test = require('node:test');
const { GitHubClient } = require('./release-please-auto-approve');
const { MAX_RELEASE_FILE_BYTES } = require('./release-file-body');
const commit = 'a'.repeat(40);
function fixture(content = Buffer.from('{}')) {
  const sha = createHash('sha1')
    .update(`blob ${content.length}\0`)
    .update(content)
    .digest('hex');
  const body = {
    sha,
    size: content.length,
    encoding: 'base64',
    content: content.toString('base64'),
  };
  const metadata = { ...body, type: 'file', path: 'bun.lock' };
  return { body, metadata, content };
}
function client(metadata, blob) {
  const github = new GitHubClient({ repository: 'test/repo', token: 'test' });
  const calls = [];
  github.request = async (...args) => {
    calls.push(args);
    return args[1].startsWith('/contents/') ? metadata : blob;
  };
  return { github, calls };
}
for (const length of [2, 1024 * 1024 - 1, 1024 * 1024, 1024 * 1024 + 1]) {
  test(`reads an exact immutable file at the Contents boundary ${length}`, async () => {
    const item = fixture(Buffer.alloc(length, 'x'));
    const large = length > 1024 * 1024;
    const metadata = large
      ? {
          ...item.metadata,
          encoding: 'none',
          content: '',
          git_url: 'https://untrusted.invalid/blob',
        }
      : item.metadata;
    const { github, calls } = client(metadata, item.body);
    assert.equal(
      await github.readFileAt('bun.lock', commit),
      item.content.toString()
    );
    assert.deepEqual(calls[0], [
      'GET',
      '/contents/bun.lock',
      { query: { ref: commit }, accept: 'application/vnd.github.object+json' },
    ]);
    assert.equal(calls.length, large ? 2 : 1);
    if (large)
      assert.deepEqual(calls[1], ['GET', `/git/blobs/${item.metadata.sha}`]);
  });
}
test('accepts wrapped base64 but not a moving file reference', async () => {
  const item = fixture();
  const { github } = client({
    ...item.metadata,
    content: `${item.body.content}\n`,
  });
  assert.equal(await github.readFileAt('bun.lock', commit), '{}');
  await assert.rejects(
    github.readFileAt('bun.lock', 'production'),
    /Immutable/
  );
});
for (const [name, patch] of Object.entries({
  wrongPath: { path: 'other.lock' },
  invalidSha: { sha: '../all' },
  directory: { type: 'dir' },
  oversize: { size: MAX_RELEASE_FILE_BYTES + 1 },
  fraction: { size: 2.5 },
  negative: { size: -1 },
})) {
  test(`rejects invalid metadata before blob retrieval: ${name}`, async () => {
    const item = fixture();
    const { github, calls } = client({ ...item.metadata, ...patch });
    await assert.rejects(github.readFileAt('bun.lock', commit), /metadata/);
    assert.equal(calls.length, 1);
  });
}
for (const [name, patch] of Object.entries({
  wrongSha: { sha: 'b'.repeat(40) },
  wrongSize: { size: 3 },
  truncation: { truncated: true },
  incomplete: { content: Buffer.from('{').toString('base64') },
  malformed: { content: '%%%=' },
  noncanonical: { content: 'e31=' },
  sameLengthWrongBytes: { content: Buffer.from('[]').toString('base64') },
  wrongEncoding: { encoding: 'none' },
})) {
  test(`rejects malformed or mismatched immutable blob: ${name}`, async () => {
    const item = fixture();
    const { github } = client(
      { ...item.metadata, encoding: 'none', content: '' },
      { ...item.body, ...patch }
    );
    await assert.rejects(github.readFileAt('bun.lock', commit));
  });
}
test('rejects invalid UTF-8 even when its Git blob hash and size match', async () => {
  const item = fixture(Buffer.from([0xff]));
  const { github } = client(item.metadata);
  await assert.rejects(github.readFileAt('bun.lock', commit));
});
