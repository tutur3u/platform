const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Guard for every app's Next proxy matcher: an asset-like suffix on a
// protected route (e.g. /personal/tasks/x.png) must never skip the proxy,
// because that bypasses the signed-out redirect and API guards. Only real
// static assets (framework output, root public files, public asset folders)
// may skip it.

const repoRoot = path.resolve(__dirname, '..');
const appsDir = path.join(repoRoot, 'apps');

// Paused or proxy-less apps and API-only matchers are skipped automatically.
function readMatchers() {
  const result = [];
  for (const app of fs.readdirSync(appsDir).sort()) {
    const proxyPath = path.join(appsDir, app, 'src', 'proxy.ts');
    if (!fs.existsSync(proxyPath)) continue;
    const source = fs.readFileSync(proxyPath, 'utf8');
    const configIndex = source.indexOf('export const config');
    if (configIndex === -1) continue;
    const literal = source
      .slice(configIndex)
      .match(/'(\/\(\(\?!.*\)\.\*\))'/)?.[1];
    if (!literal) continue;
    result.push({
      app,
      matcher: new RegExp(`^${literal.replaceAll('\\\\', '\\')}$`),
    });
  }
  return result;
}

const PROTECTED_PROBES = [
  '/personal/tasks/stage-smoke-probe.png',
  '/vi/personal/tasks/stage-smoke-probe.png',
  '/en/internal/settings/report.pdf',
  '/personal/boards/board.svg',
  '/personal/export.json',
  '/api/v1/workspaces/personal/file.png',
  '/_nextfoo',
];

function listPublicImages(dir, prefix) {
  if (!fs.existsSync(dir)) return [];
  const images = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const urlPath = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      images.push(...listPublicImages(path.join(dir, entry.name), urlPath));
    } else if (/\.(?:svg|png|jpg|jpeg|gif|webp)$/.test(entry.name)) {
      images.push(urlPath);
    }
  }
  return images;
}

const matchers = readMatchers();

test('discovers the app proxy matchers', () => {
  assert.ok(matchers.length >= 20, `found ${matchers.length} matchers`);
  for (const app of ['web', 'workspace', 'tasks', 'calendar', 'mail', 'chat']) {
    assert.ok(
      matchers.some((entry) => entry.app === app),
      `missing matcher for ${app}`
    );
  }
});

for (const { app, matcher } of matchers) {
  test(`${app}: asset-like suffixes never skip protected routes`, () => {
    for (const probe of PROTECTED_PROBES) {
      assert.equal(matcher.test(probe), true, `${app} skips ${probe}`);
    }
  });

  test(`${app}: framework static output still skips the proxy`, () => {
    assert.equal(matcher.test('/_next/static/chunks/app.js'), false);
  });

  test(`${app}: public images still skip the proxy`, () => {
    const publicDir = path.join(appsDir, app, 'public');
    for (const urlPath of listPublicImages(publicDir, '')) {
      assert.equal(
        matcher.test(urlPath),
        false,
        `${app} runs the proxy for ${urlPath}`
      );
    }
  });
}
