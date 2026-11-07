const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const root = path.resolve(__dirname, '..');
const binary = path.join(root, 'node_modules', '.bin', 'oxlint');
function lint(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oxc-security-parity-'));
  try {
    const file = path.join(dir, 'control.tsx');
    fs.writeFileSync(file, source);
    const result = cp.spawnSync(
      binary,
      [
        '--config',
        path.join(root, '.oxlintrc.json'),
        '--format=json',
        '--no-ignore',
        file,
      ],
      { encoding: 'utf8', cwd: root }
    );
    assert.ifError(result.error);
    return {
      status: result.status,
      diagnostics: JSON.parse(result.stdout).diagnostics,
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
test('the actual root config rejects an unsuppressed HTML injection sink', () => {
  const result = lint(
    'export const Unsafe = ({html}: {html: string}) => <div dangerouslySetInnerHTML={{__html:html}} />;'
  );
  assert.equal(result.status, 1);
  assert.ok(
    result.diagnostics.some((item) => item.code === 'react(no-danger)')
  );
});
test('ordinary React text remains accepted', () => {
  const result = lint(
    'export const Safe = ({text}: {text: string}) => <div>{text}</div>;'
  );
  assert.equal(result.status, 0);
  assert.deepEqual(result.diagnostics, []);
});
test('a narrow trusted-markup exception passes without a path exemption', () => {
  const result = lint(`export const Safe = () => <div
    // eslint-disable-next-line react/no-danger -- Synthetic trusted literal; no untrusted input.
    dangerouslySetInnerHTML={{__html:'<b>trusted</b>'}} />;`);
  assert.equal(result.status, 0);
  assert.deepEqual(result.diagnostics, []);
});
test('a justified one-line exception cannot suppress an adjacent unsafe sink', () => {
  const result = lint(`export const Example = ({html}: {html: string}) => <>
    <div
      // eslint-disable-next-line react/no-danger -- Synthetic trusted markup control.
      dangerouslySetInnerHTML={{__html:'<b>trusted</b>'}} />
    <div dangerouslySetInnerHTML={{__html:html}} />
  </>;`);
  assert.equal(result.status, 1);
  assert.equal(
    result.diagnostics.filter((item) => item.code === 'react(no-danger)')
      .length,
    1
  );
});
test('React style text preserves CSS and cannot terminate its containing style', () => {
  assert.equal(
    renderToStaticMarkup(
      React.createElement('style', null, ':root { --color-safe: #fff; }')
    ),
    '<style>:root { --color-safe: #fff; }</style>'
  );
  const markup = renderToStaticMarkup(
    React.createElement('style', null, '</style><script>alert(1)</script>')
  );
  assert.equal((markup.match(/<\/style>/gi) ?? []).length, 1);
});
