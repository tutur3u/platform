import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../..'
);
const checkedSections = ['epm', 'root', 'settings', 'studio'] as const;
const bannedProductTerms = [
  /external project/i,
  /canonical/i,
  /adapter/i,
  /binding/i,
  /payload/i,
  /metadata/i,
  /profile data/i,
  /\bJSON\b/i,
  /schema/i,
  /field definition/i,
  /slug/i,
  /\bentry\b/i,
  /\bentries\b/i,
  /\bcollection\b/i,
  /\bcollections\b/i,
  /Workspace ID/i,
];

function collectStrings(
  value: unknown,
  path: string[],
  output: Array<{ path: string; value: string }>
) {
  if (typeof value === 'string') {
    output.push({ path: path.join('.'), value });
    return;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    collectStrings(child, [...path, key], output);
  }
}

function loadExternalProjectMessages(locale: 'en' | 'vi') {
  return JSON.parse(
    readFileSync(resolve(repoRoot, `apps/cms/messages/${locale}.json`), 'utf8')
  )['external-projects'];
}

describe('CMS product copy', () => {
  it('keeps visible CMS strings on consumer product vocabulary', () => {
    const violations: string[] = [];

    for (const locale of ['en', 'vi'] as const) {
      const externalProjectMessages = loadExternalProjectMessages(locale);
      const strings: Array<{ path: string; value: string }> = [];

      for (const section of checkedSections) {
        collectStrings(externalProjectMessages[section], [section], strings);
      }

      for (const item of strings) {
        for (const bannedTerm of bannedProductTerms) {
          if (bannedTerm.test(item.value)) {
            violations.push(`${locale}.${item.path}: ${item.value}`);
            break;
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
