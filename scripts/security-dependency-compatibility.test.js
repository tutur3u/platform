const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');
const { existsSync, readFileSync, realpathSync } = require('node:fs');
const root = resolve(__dirname, '..');
const mail = createRequire(resolve(root, 'apps/mail/package.json'));
const mailauth = createRequire(mail.resolve('mailauth'));
function findDependency(parent, name) {
  const manifest = parent.resolve
    .paths(name)
    .map((directory) => resolve(directory, name, 'package.json'))
    .find(existsSync);
  return manifest ? createRequire(manifest) : undefined;
}
function dependencyRequire(parent, name) {
  const found = findDependency(parent, name);
  assert.ok(found, `Installed consumer dependency is missing: ${name}`);
  return found;
}
// The iMessage adapter's Photon chain (the only @grpc/grpc-js consumer) is
// platform-specific and absent from Linux installs, where gRPC is unreachable.
const ai = createRequire(resolve(root, 'packages/ai/package.json'));
const imessage = findDependency(ai, 'chat-adapter-imessage');
const spectrum = imessage && findDependency(imessage, 'spectrum-ts');
const photon =
  spectrum && findDependency(spectrum, '@photon-ai/advanced-imessage');
test('security dependency overrides retain consumer behavior', async () => {
  const Joi = mailauth('joi');
  const schema = Joi.object({
    email: Joi.string().email().required(),
    url: Joi.string()
      .uri({ scheme: ['https'] })
      .required(),
  });
  assert.equal(
    schema.validate({ email: 'person@example.com', url: 'https://example.com' })
      .error,
    undefined
  );
  assert.ok(schema.validate({ email: 'bad', url: 'javascript:bad' }).error);
  const nodemailer = mailauth('nodemailer');
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'unix',
  });
  const message = await transport.sendMail({
    from: 'sender@example.com',
    to: 'Person <person@example.com>',
    subject: 'Security patch compatibility',
    text: 'Body',
  });
  assert.deepEqual(message.envelope.to, ['person@example.com']);
  assert.match(
    message.message.toString(),
    /Subject: Security patch compatibility/
  );
  transport.close();
  console.log(
    'PASS mailauth Joi validation and Nodemailer MIME/envelope composition'
  );
  const web = createRequire(resolve(root, 'apps/web/package.json'));
  const excalidraw = createRequire(web.resolve('@excalidraw/excalidraw'));
  const mermaid = dependencyRequire(
    excalidraw,
    '@excalidraw/mermaid-to-excalidraw'
  );
  const nanoid = await import(pathToFileURL(mermaid.resolve('nanoid')).href);
  const id = nanoid.nanoid(21);
  assert.equal(id.length, 21);
  assert.match(id, /^[\w-]+$/);
  console.log('PASS Excalidraw consumer resolves ESM Nanoid 5');
  const ui = createRequire(resolve(root, 'packages/ui/package.json'));
  const typography = createRequire(ui.resolve('@tailwindcss/typography'));
  const parser = typography('postcss-selector-parser');
  assert.equal(
    parser((selectors) =>
      selectors.walkClasses((c) => {
        c.value = 'patched';
      })
    ).processSync('.old > a:hover'),
    '.patched > a:hover'
  );
  console.log('PASS Tailwind typography selector-parser 7 mutation');
  const math = dependencyRequire(web, '@streamdown/math');
  const katex = math('katex');
  assert.match(katex.renderToString('x^2', { throwOnError: true }), /katex/);
  console.log('PASS Streamdown KaTeX consumer math rendering');
  const firebase = createRequire(web.resolve('firebase-admin'));
  const storage = createRequire(firebase.resolve('@google-cloud/storage'));
  const gaxios = createRequire(storage.resolve('gaxios'));
  const uuid = gaxios('uuid');
  const value = uuid.v4();
  assert.equal(uuid.validate(value), true);
  assert.equal(uuid.version(value), 4);
  console.log('PASS Google Storage gaxios UUID 11 consumer generation');
});

test('patched gRPC retains Photon consumer loopback behavior', {
  skip: photon
    ? false
    : 'Photon iMessage chain is not installed on this platform',
}, async () => {
  const grpc = photon('@grpc/grpc-js');
  const serialize = (x) => Buffer.from(JSON.stringify(x));
  const deserialize = (x) => JSON.parse(x.toString());
  const service = {
    echo: {
      path: '/security.Compatibility/Echo',
      requestStream: false,
      responseStream: false,
      requestSerialize: serialize,
      requestDeserialize: deserialize,
      responseSerialize: serialize,
      responseDeserialize: deserialize,
    },
  };
  const server = new grpc.Server();
  server.addService(service, {
    echo: (call, cb) => cb(null, { value: call.request.value }),
  });
  const port = await new Promise((res, rej) =>
    server.bindAsync(
      '127.0.0.1:0',
      grpc.ServerCredentials.createInsecure(),
      (err, port) => (err ? rej(err) : res(port))
    )
  );
  const Client = grpc.makeGenericClientConstructor(service, 'Compatibility');
  const client = new Client(
    `127.0.0.1:${port}`,
    grpc.credentials.createInsecure()
  );
  try {
    const result = await new Promise((res, rej) =>
      client.echo(
        { value: 'roundtrip' },
        { deadline: new Date(Date.now() + 5000) },
        (err, result) => (err ? rej(err) : res(result))
      )
    );
    assert.deepEqual(result, { value: 'roundtrip' });
  } finally {
    client.close();
    server.forceShutdown();
  }
  console.log('PASS Photon ancestry gRPC loopback unary roundtrip');
});

// Void's Drizzle Kit pulls the deprecated @esbuild-kit loader, which pins
// esbuild ~0.18 (GHSA-67mh-4wv8-2f99). The override must keep its transform API.
test('esbuild-kit consumer transforms TypeScript on patched esbuild', () => {
  // Follow the isolated linker's store paths so hoisted root copies cannot
  // satisfy a transitive lookup the real consumer would not see.
  const storeRequire = (parent, name) =>
    createRequire(
      realpathSync(dependencyRequire(parent, name).resolve(`./package.json`))
    );
  const apps = createRequire(resolve(root, 'apps/apps/package.json'));
  const kit = [
    'void',
    'drizzle-kit',
    '@esbuild-kit/esm-loader',
    '@esbuild-kit/core-utils',
  ].reduce(storeRequire, apps);
  const [major, minor] = kit('esbuild/package.json').version.split('.');
  assert.ok(Number(major) > 0 || Number(minor) >= 25, 'esbuild >= 0.25.0');
  const { code } = kit('@esbuild-kit/core-utils').transformSync(
    'const answer: number = 42; export default answer;',
    resolve(root, 'fixture.ts'),
    { format: 'cjs' }
  );
  assert.equal(
    new Function('module', 'exports', `${code}; return module.exports;`)(
      { exports: {} },
      {}
    ).default,
    42
  );
  console.log('PASS esbuild-kit TypeScript transform on patched esbuild');
});

// The standalone OpenCode plugin lockfile has no tracked manifest, so a local
// OpenCode reinstall can silently restore toml 4.x (GHSA-4qx8-w7c3-pj3p,
// GHSA-9j65-hcg3-gc64, GHSA-9qmh-m7c6-f92p). Regenerate it with a temporary
// manifest that overrides toml instead of committing the downgrade.
test('OpenCode plugin lockfile keeps patched toml', () => {
  const lock = JSON.parse(
    readFileSync(resolve(root, '.opencode/package-lock.json'), 'utf8')
  );
  const entries = Object.entries(lock.packages).filter(([path]) =>
    /(^|\/)node_modules\/toml$/.test(path)
  );
  assert.ok(entries.length > 0, 'toml entry is present in the lockfile');
  for (const [path, { version }] of entries) {
    const [major, minor, patch] = version.split('.').map(Number);
    assert.ok(
      major > 5 || (major === 5 && (minor > 0 || patch >= 1)),
      `${path} must be toml >= 5.0.1, found ${version}`
    );
  }
});
