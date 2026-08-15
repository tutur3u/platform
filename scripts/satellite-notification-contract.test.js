import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const appsDir = path.join(repoRoot, 'apps');
const REQUIRED_MESSAGE_KEYS = [
  'common.retry',
  'notifications.accept',
  'notifications.decline',
];

function listSourceFiles(directory) {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(entryPath);
    return /\.[cm]?[jt]sx?$/u.test(entry.name) ? [entryPath] : [];
  });
}

function getMessage(messages, key) {
  return key.split('.').reduce((value, segment) => value?.[segment], messages);
}

test('every app rendering the shared notification bell ships its message contract', () => {
  const checkedApps = [];

  for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const appDir = path.join(appsDir, entry.name);
    const notificationSource = listSourceFiles(path.join(appDir, 'src')).some(
      (sourceFile) =>
        fs.readFileSync(sourceFile, 'utf8').includes('NotificationPopover')
    );
    if (!notificationSource) continue;

    checkedApps.push(entry.name);
    for (const locale of ['en', 'vi']) {
      const messagePath = path.join(appDir, 'messages', `${locale}.json`);
      assert.ok(
        fs.existsSync(messagePath),
        `${entry.name} renders notifications but has no ${locale} messages`
      );
      const messages = JSON.parse(fs.readFileSync(messagePath, 'utf8'));
      for (const key of REQUIRED_MESSAGE_KEYS) {
        assert.equal(
          typeof getMessage(messages, key),
          'string',
          `${entry.name}/${locale} is missing ${key}`
        );
      }
    }
  }

  assert.ok(checkedApps.length >= 10, 'expected the registered satellite apps');
});

test('Mail keeps the jsdom-backed sanitizer outside its server bundle', () => {
  const config = fs.readFileSync(
    path.join(appsDir, 'mail', 'next.config.ts'),
    'utf8'
  );

  assert.match(config, /serverExternalPackages:\s*\['isomorphic-dompurify'\]/u);
});
