const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

const root = resolve(__dirname, '../..');
const documents = [
  {
    path: 'plugins/tuturuuu/skills/tuturuuu-development-tooling/references/ci-tooling-patterns.md',
    minLines: 1000,
    headings: [
      '# CI And Tooling Patterns',
      '## Incremental Oxc and Worker adoption',
      '## cf CLI migration boundaries',
      '## Cloudflare runaway-work review',
      '## Codex plugin native parallel pilot',
      '## Inactive runtimes until further notice',
      '## File Size Ceiling',
      '## Bun runtime pins',
      '## Commands And Formatting',
      '## Validation job relevance',
      '## Packed SDK install diagnostics',
      '## Satellite build evidence',
      '## Root Scripts',
      '## CI And Dependency Drift',
      '## Plugin Changes',
      '## Cron Control native Worker toolchain',
      '## Native Meet realtime toolchain',
      '## Vite+ native service Worker boundary',
      '## Owning Next app build evidence',
      '### Vitest temporary module collection failures',
      '### Coordination alarm qualification',
      '## Mintlify connectivity cancellation',
      '## SDK release qualification phases',
      '## Windows desktop beta packaging',
      '## Apps finite public SDK acceptance',
      '## Wave-1 staging publication admission',
      '## Reusable staging publisher permissions',
    ],
  },
  {
    path: 'apps/docs/build/development-tools/cf-cli-wrangler-parity.mdx',
    minLines: 240,
    headings: [
      '## Decision',
      '## Toolchain shape',
      '## Operation parity matrix',
      '## Native Worker template',
      '## Rollback',
      '## Wrangler usage guard',
      '## Service inventory',
      '## Settings preflight token permissions',
      '## Deployment account variable',
      '## Cached Build Output',
      '## Production cutover checklist',
    ],
  },
];

function assertDocument(content, { path, minLines, headings }) {
  const lines = content.trimEnd().split(/\r?\n/);
  const missing = headings.filter((heading) => !lines.includes(heading));
  assert.deepEqual(missing, [], `${path}: restore required headings`);
  assert.ok(
    lines.length >= minLines,
    `${path}: expected at least ${minLines} lines, found ${lines.length}; check for truncated guidance`
  );
}

for (const document of documents) {
  test(`${document.path} retains its required sections and minimum size`, () => {
    assertDocument(
      readFileSync(resolve(root, document.path), 'utf8'),
      document
    );
  });
}

test('heading guard rejects section loss even when line count is preserved', () => {
  for (const document of documents) {
    const content = readFileSync(resolve(root, document.path), 'utf8');
    const changed = content.replace(
      document.headings.at(-1),
      'Removed section'
    );
    assert.throws(() => assertDocument(changed, document), /required headings/);
  }
});

test('size guard rejects truncation even when every heading survives', () => {
  for (const document of documents) {
    const abbreviated = [
      ...document.headings,
      ...Array(document.minLines - document.headings.length - 1).fill(
        'padding'
      ),
    ].join('\n');
    assert.throws(
      () => assertDocument(abbreviated, document),
      /truncated guidance/
    );
  }
});
