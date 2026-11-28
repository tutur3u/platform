import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { parseWikiMarkdown } from './markdown';
import { hashWikiSafetyTerm, scanPublicSafety } from './safety';

vi.mock('./safety-rules', async (original) => {
  const rules = await original<typeof import('./safety-rules')>();
  const hash = (value: string) =>
    createHash('sha256').update(`${rules.TERM_SALT}:${value}`).digest('hex');
  return {
    ...rules,
    HASHED_TERMS: {
      ...rules.HASHED_TERMS,
      'fleet host or machine name': [
        ...rules.HASHED_TERMS['fleet host or machine name'],
        hash('testmachine'),
      ],
      'customer name without consent': [
        ...rules.HASHED_TERMS['customer name without consent'],
        hash('testcustomerfixture'),
      ],
    },
  };
});

function scan(
  markdown: string,
  links?: Parameters<typeof scanPublicSafety>[1]
) {
  return scanPublicSafety(parseWikiMarkdown(markdown).body, links);
}

describe('public safety scan', () => {
  it('blocks legacy and new patterns without repeating matched material', () => {
    const id = '0123456789abcdef'.repeat(2);
    const assignment = 'API_KEY=synthetic-example';
    const findings = scan(
      [
        'Sample SR-999',
        '',
        `Test ID: ${id}`,
        '',
        '~~~sh',
        assignment,
        '/Users/example/path',
        '10.0.2.2',
        'sample.internal',
        '~~~',
      ].join('\n')
    );
    expect(findings.map(({ rule }) => rule)).toEqual(
      expect.arrayContaining([
        'internal security register ID',
        '32-hex identifier',
        'secret assignment',
        'developer home-directory path',
        'private network address',
        'internal hostname',
      ])
    );
    expect(JSON.stringify(findings)).not.toContain(id);
    expect(JSON.stringify(findings)).not.toContain(assignment);
  });

  it('matches hashed terms across marks and lines and checks machine prefixes', () => {
    expect(
      scan('Test **customer**\nfixture.\n\nTestMachine.example').map(
        ({ rule }) => rule
      )
    ).toEqual(
      expect.arrayContaining([
        'customer name without consent',
        'fleet host or machine name',
      ])
    );
    expect(hashWikiSafetyTerm('Test customer-fixture')).toBe(
      hashWikiSafetyTerm('testcustomerfixture')
    );
  });

  it('requires public visibility for every wiki destination and keeps build held', () => {
    const publicHref = '/wiki/tuturuuu/overview';
    const heldHref = '/wiki/tuturuuu/build/runbook';
    const privateHref = '/wiki/tuturuuu/draft';
    const links = new Map([
      [publicHref, 'public'],
      [heldHref, 'public'],
      [privateHref, 'internal'],
    ] as const);
    const findings = scan(
      [
        `[Public](${publicHref}#intro)`,
        `[Private](${privateHref})`,
        `[Held](${heldHref})`,
        '[Missing](/wiki/tuturuuu/unclassified)',
        '[Within](#intro)',
      ].join(' '),
      links
    );
    expect(findings.map(({ rule }) => rule)).toEqual([
      'link to non-public or unresolved wiki page',
      'link into held build subtree',
      'link to non-public or unresolved wiki page',
    ]);
    expect(scan(`[Public](${publicHref})`)).toHaveLength(1);
  });

  it('checks cards, decoded URL values and revision metadata', () => {
    const body = parseWikiMarkdown(
      '~~~cards single\ncards:\n  - title: Example\n    href: https://example.com/?id=%53%52%2D123\n~~~'
    ).body;
    const findings = scanPublicSafety(body, undefined, {
      title: 'Sample',
      description: 'host.ts.net',
    });
    expect(findings).toEqual(
      expect.arrayContaining([
        {
          rule: 'internal security register ID',
          location: 'body.content.0.attrs.href',
        },
        { rule: 'tailnet hostname', location: 'description' },
      ])
    );
  });

  it('fails closed on unknown components and ignores content-address hashes', () => {
    expect(
      scanPublicSafety({ type: 'doc', content: [{ type: 'FutureComponent' }] })
    ).toEqual([{ rule: 'invalid wiki content', location: 'body.content.0' }]);
    expect(scan(`![Sample](/wiki/tuturuuu/_assets/${'b'.repeat(64)})`)).toEqual(
      []
    );
  });
});
