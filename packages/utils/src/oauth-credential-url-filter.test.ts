import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// PostgREST sends every query-builder filter in the request URL, where API
// gateway and proxy logs retain it. OAuth credential columns must never be
// filtered by value; resolve rows by id and compare credentials in SQL (via
// an RPC body) or in process. Null checks carry no value and are allowed.
// Known limits: computed column names and differently named columns (for
// example push-notification `token`) are not detected.
// Includes JSON paths and qualified names such as `data->>access_token`.
const CREDENTIAL = String.raw`[\w.>-]*(?:access|refresh)_token[\w.>-]*`;
const QUOTE = '[\'"`]';
// Any builder method whose first argument is a credential column, except
// builders that name a column without filtering on its value.
const METHOD_FILTER = new RegExp(
  String.raw`\.(\w+)\(\s*${QUOTE}${CREDENTIAL}${QUOTE}\s*,\s*([^)]*)\)`,
  'g'
);
// Builders that name a column without filtering on it, and form-body
// `append` for OAuth token requests (POST bodies, not URLs).
const NON_FILTER_METHODS = new Set(['append', 'onConflict', 'order', 'select']);
const OTHER_FILTERS = [
  new RegExp(String.raw`\.match\(\s*\{[^}]*\b${CREDENTIAL}\b`, 'g'),
  new RegExp(
    String.raw`\.or\(\s*${QUOTE}[^'"\`]*\b\w*(?:access|refresh)_token\w*\.(?!is\.null\b)`,
    'g'
  ),
  // Hand-built PostgREST query strings, any operator.
  new RegExp(String.raw`\b${CREDENTIAL}=(?:not\.)?\w+\.`, 'g'),
];
const NULL_CHECK = /^(?:null|(['"`])is\1\s*,\s*null)\s*$/;

const repositoryRoot = resolve(__dirname, '../../..');
const SELF = 'packages/utils/src/oauth-credential-url-filter.test.ts';

function credentialUrlFilters(source: string): string[] {
  const findings: string[] = [];
  for (const match of source.matchAll(METHOD_FILTER)) {
    if (NON_FILTER_METHODS.has(match[1] ?? '')) continue;
    if (NULL_CHECK.test(match[2]?.trim() ?? '')) continue;
    findings.push(match[0].replace(/\s+/g, ' '));
  }
  for (const pattern of OTHER_FILTERS)
    for (const match of source.matchAll(pattern))
      findings.push(match[0].replace(/\s+/g, ' '));
  return findings;
}

// Tracked sources anywhere in the repository that mention a credential
// column at all, excluding the paused runtimes.
function candidateSources(): string[] {
  return execFileSync(
    'git',
    [
      'grep',
      '-lzE',
      '(access|refresh)_token',
      '--',
      '.',
      ':!apps/backend',
      ':!apps/tanstack-web',
    ],
    { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
    .split('\0')
    .filter(
      (file) =>
        /\.(?:[cm]?[jt]sx?|dart|rs|py|sh)$/.test(file) &&
        !file.includes('node_modules/') &&
        file !== SELF
    );
}

describe('OAuth credential URL filters', () => {
  it('detects value filters and allows null checks and non-filter builders', () => {
    expect(
      credentialUrlFilters(`
        db.from('t').eq('access_token', token);
        db.from('t').update(x).eq(
          'refresh_token',
          row.refresh_token
        );
        db.from('t').match({ id, refresh_token: value });
        db.from('t').or(\`access_token.eq.\${token}\`);
        db.from('t').filter("refresh_token", 'eq', value);
        supabase.from('t').inFilter('access_token', [token]);
        db.from('t').ilikeAnyOf('provider_refresh_token', [value]);
        db.from('t').isDistinct('access_token', value);
        fetch(\`/rest/v1/t?refresh_token=eq.\${value}\`);
        db.from('t').not('access_token', 'is', null);
        db.from('t').is('refresh_token', null);
        supabase.from('t').isFilter('access_token', null);
        db.from('t').eq('id', id).select('access_token');
        db.from('t').order('refresh_token', { ascending: true });
        db.from('t').or('access_token.is.null');
        db.from('t').eq('data->>refresh_token', value);
        fetch(\`/rest/v1/t?access_token=not.cs.\${value}\`);
        body.append('refresh_token', credential);
      `)
    ).toHaveLength(11);
  });

  it('finds no credential-valued filter in any repository source', () => {
    const files = candidateSources();
    expect(files.length).toBeGreaterThan(0);
    const findings = files.flatMap((file) =>
      credentialUrlFilters(
        readFileSync(resolve(repositoryRoot, file), 'utf8')
      ).map((finding) => `${file}: ${finding}`)
    );
    expect(findings).toEqual([]);
  }, 60_000);
});
