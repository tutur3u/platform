import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const require = createRequire(
  new URL('../../apps/meet/package.json', import.meta.url)
);
const React = require('react');
const { prerender } = require('react-dom/static');
const { resume } = require('react-dom/server');
const adapter = resolve(
  dirname(require.resolve('@opennextjs/cloudflare')),
  '../..'
);
const adapterRequire = createRequire(resolve(adapter, 'package.json'));
const { build } = adapterRequire('esbuild');
const bundler = readFileSync(
  resolve(adapter, 'dist/cli/build/bundle-server.js'),
  'utf8'
);

async function bundleComponent(keepNames) {
  const result = await build({
    stdin: {
      contents:
        "export { id as first } from 'first'; export { id as second } from 'second';",
    },
    bundle: true,
    write: false,
    format: 'cjs',
    keepNames,
    minifyIdentifiers: false,
    plugins: [
      {
        name: 'colliding-component-names',
        setup(builder) {
          builder.onResolve({ filter: /^(first|second)$/ }, (args) => ({
            path: args.path,
            namespace: 'fixture',
          }));
          builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
            contents:
              "export function id({ children }) { return React.createElement('main', null, children); }",
            loader: 'js',
          }));
        },
      },
    ],
  });
  const module = { exports: {} };
  runInNewContext(result.outputFiles[0].text, {
    module,
    exports: module.exports,
    React,
  });
  return module.exports.second;
}

async function resumeErrors(Component) {
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const controller = new AbortController();
  function Content() {
    return React.use(pending);
  }
  function id({ children }) {
    return React.createElement('main', null, children);
  }
  const tree = (Parent) =>
    React.createElement(
      Parent,
      null,
      React.createElement(
        React.Suspense,
        { fallback: 'Loading' },
        React.createElement(Content)
      )
    );
  const timer = setTimeout(() => controller.abort(), 30);
  let shell;
  try {
    shell = await prerender(tree(id), {
      signal: controller.signal,
      onError() {},
    });
  } finally {
    clearTimeout(timer);
  }
  assert.ok(
    shell.postponed,
    'fixture must exercise a postponed server-rendered boundary'
  );
  finish('Ready');
  const errors = [];
  const stream = await resume(tree(Component), shell.postponed, {
    onError(error) {
      errors.push(error.message);
    },
  });
  await new Response(stream).text();
  return errors;
}

test('Meet Worker bundling preserves names needed to resume React prerenders', async () => {
  // The actual installed adapter must preserve names, not only this fixture.
  const keepNames = /\bkeepNames:\s*true\b/.test(bundler);
  assert.equal(keepNames, true, 'OpenNext name-preservation patch is missing');
  const broken = await bundleComponent(false);
  assert.notEqual(broken.name, 'id');
  assert.match(
    (await resumeErrors(broken)).join('\n'),
    /Expected the resume to render <id>/
  );
  const fixed = await bundleComponent(keepNames);
  assert.equal(fixed.name, 'id');
  assert.deepEqual(await resumeErrors(fixed), []);
});
