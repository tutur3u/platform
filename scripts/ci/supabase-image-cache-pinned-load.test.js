const assert = require('node:assert/strict');
const test = require('node:test');
const { createHash } = require('node:crypto');
const { cacheKey, verifyLoadedImages } = require('./supabase-image-cache.js');
const {
  catalogPin,
  digestReference,
  verifyPinned,
  verifyPinnedContent,
} = require('./supabase-image-cache-seed.js');
const data = require('./supabase-image-cache-seed-data.json');
const catalog = 'cli-2.121.0';
const images = data.catalogs[catalog].profiles.contract;
const identity = {
  images,
  registry: 'public.ecr.aws',
  platform: 'linux',
  arch: 'x64',
};

// Mutations are restored synchronously before another test can observe them.
test('fixed keys bind every trusted pin while ordinary keys retain their identity', () => {
  const pinned = cacheKey({ ...identity, catalog });
  const ordinary = cacheKey(identity);
  assert.equal(
    ordinary,
    `supabase-images-v1-${createHash('sha256')
      .update(
        JSON.stringify({ ...identity, images: [...new Set(images)].sort() })
      )
      .digest('hex')}`
  );
  assert.equal(cacheKey({ ...identity, catalog: 'current' }), ordinary);
  const pin = catalogPin(catalog, images[0]);
  for (const field of Object.keys(pin)) {
    const original = pin[field];
    try {
      pin[field] = `sha256:${'0'.repeat(64)}`;
      assert.notEqual(cacheKey({ ...identity, catalog }), pinned, field);
      assert.equal(cacheKey(identity), ordinary, field);
    } finally {
      pin[field] = original;
    }
  }
  assert.equal(cacheKey({ ...identity, catalog }), pinned);
});

function inspect(image, patch = {}) {
  const pin = catalogPin(catalog, image);
  return {
    status: 0,
    stdout: JSON.stringify([
      {
        Os: 'linux',
        Architecture: 'amd64',
        Id: pin.config,
        RepoDigests: [digestReference(image, pin)],
        ...patch,
      },
    ]),
  };
}

test('restored fixed images require matching digest, config and platform despite matching tags', () => {
  for (const patch of [
    { Id: `sha256:${'0'.repeat(64)}` },
    { Os: 'windows' },
    { Architecture: 'arm64' },
  ]) {
    assert.throws(
      () =>
        verifyLoadedImages(images, catalog, {
          deadline: 100,
          now: () => 0,
          spawn: (_command, args) => inspect(args.at(-1), patch),
        }),
      /digest mismatch/
    );
  }
  const seen = [];
  verifyLoadedImages(images, catalog, {
    deadline: 100,
    now: () => 0,
    spawn: (command, args, options) => {
      assert.equal(command, 'docker');
      assert.deepEqual(args.slice(0, 2), ['image', 'inspect']);
      assert.equal(options.timeout, 100);
      seen.push(args.at(-1));
      return inspect(args.at(-1));
    },
  });
  assert.deepEqual(seen, images);
});

test('archive content pins survive missing registry references while pulls stay strict', () => {
  const options = {
    deadline: 100,
    now: () => 0,
    spawn: (_command, args) => inspect(args.at(-1), { RepoDigests: [] }),
  };
  assert.doesNotThrow(() => verifyLoadedImages(images, catalog, options));
  assert.throws(
    () => verifyPinned(images[0], catalogPin(catalog, images[0]), options),
    /digest mismatch/
  );
});

test('malformed content pins fail before inspecting cached content', () => {
  for (const config of [undefined, '', 'tag', 'sha256:wrong'])
    assert.throws(
      () =>
        verifyPinnedContent(
          images[0],
          { config },
          {
            deadline: 100,
            spawn: () => assert.fail('invalid pin must not reach Docker'),
          }
        ),
      /Invalid seed content pin/
    );
});

test('ordinary restored images retain tag inspection without fixed seed admission', () => {
  for (const catalog of [undefined, 'current']) {
    const calls = [];
    verifyLoadedImages(['example.invalid/service:tag'], catalog, {
      command: (...args) => calls.push(args),
      spawn: () => assert.fail('ordinary mode must not require catalog pins'),
    });
    assert.deepEqual(calls, [
      ['docker', ['image', 'inspect', 'example.invalid/service:tag']],
    ]);
  }
});
