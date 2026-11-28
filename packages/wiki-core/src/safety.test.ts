import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { parseWikiMarkdown } from './markdown';
import {
  decodeWikiHrefPass,
  hashWikiSafetyTerm,
  scanPublicSafety,
} from './safety';

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

  it.each([
    ['＠', 'personal email address', 'example＠gmail.com'],
    [
      'format characters in ID',
      '32-hex identifier',
      '0123456789abcdef\u200B0123456789abcdef',
    ],
    ['normalized credential name', 'secret assignment', 'ＡＰＩ_ＫＥＹ=sample'],
    [
      'format characters in credential name',
      'secret assignment',
      'API_\u00ADKEY=sample',
    ],
    ['lowercase assignment', 'secret assignment', 'api_key=sample'],
    ['signing key', 'secret assignment', 'SIGNING_KEY=sample'],
    ['service role key', 'secret assignment', 'SERVICE_ROLE_KEY=sample'],
    [
      'format characters in hashed term',
      'customer name without consent',
      'testcus\u200Dtomerfixture',
    ],
    [
      'uppercase Supabase host',
      'Supabase project host',
      `${'A'.repeat(20)}.SUPABASE.CO`,
    ],
    [
      'uppercase staging worker',
      'staging worker name',
      'TUTURUUU-SAMPLE-STAGING',
    ],
    ['uppercase worker host', 'workers.dev hostname', 'SAMPLE.WORKERS.DEV'],
    [
      'bounded Cloudflare labels',
      'Cloudflare account workers.dev host',
      'sample.account.workers.dev',
    ],
    ['internal host', 'internal hostname', 'one.two.internal'],
    ['compressed mapped loopback', 'private network address', '::ffff:7f00:1'],
    [
      'expanded mapped private IP',
      'private network address',
      '0:0:0:0:0:ffff:a00:1',
    ],
    ['mapped dotted IP', 'private network address', '[::ffff:192.168.0.1]'],
    [
      'loopback before a sentence period',
      'private network address',
      'Connect to ::1.',
    ],
    [
      'mapped loopback before a sentence period',
      'private network address',
      '::ffff:7f00:1.',
    ],
    [
      'expanded loopback before a sentence period',
      'private network address',
      '0:0:0:0:0:0:0:1.',
    ],
    ['loopback after a dot', 'private network address', 'host.::1'],
    ['loopback before a double dot', 'private network address', '::1..'],
    ['loopback before a domain label', 'private network address', '::1.com'],
    ['IPv6 unspecified', 'private network address', '[::]'],
  ])('detects %s', (_case, rule, value) => {
    const findings = scanPublicSafety({ type: 'doc' }, undefined, {
      title: value,
    });
    expect(findings.map((item) => item.rule)).toContain(rule);
  });

  it('allows benign lookalikes', () => {
    const title =
      'api_key SIGNING_KEYS=value item::value testcustomerfixtures example@gmail.org [::ffff:808:808] host.example';
    expect(scanPublicSafety({ type: 'doc' }, undefined, { title })).toEqual([]);
  });

  it.each([1, 2, 3])(
    'inspects href content after %i decoding passes',
    (passes) => {
      let reference = '%53%52%2D123';
      for (let i = 1; i < passes; i++)
        reference = reference.replaceAll('%', '%25');
      expect(
        scan(`[Reference](https://example.com/?ref=${reference})`)
      ).toContainEqual({
        rule: 'internal security register ID',
        location: 'body.content.0.content.0.marks.0.attrs.href',
      });
    }
  );

  it.each([
    'https://example.com/50%25-off',
    'https://example.com/?q=100%25',
    'https://example.com/?bad=%25FF',
  ])('allows literal percent encoding in %s', (href) =>
    expect(scan(`[Example](${href})`)).toEqual([])
  );

  it('rejects malformed percent encoding on the raw href', () => {
    expect(scan('[Example](https://example.com/?q=%zz)')).toContainEqual({
      rule: 'unsupported link',
      location: 'body.content.0.content.0.marks.0.attrs.href',
    });
  });

  it.each([
    'https://example.com/50%25-off?ref=%2553%2552%252D123',
    'https://example.com/?ref=%2553%2552%252D123&note=100%25',
    'https://example.com/?a=%25&b=%2553%2552%252D123',
    'https://example.com/?bad=%25FF&ref=%2553%2552%252D123',
    'https://example.com/?bad=%25FF&ref=%252553%252552%25252D123',
  ])(
    'reports an encoded register ID beside a literal percent in %s',
    (href) => {
      expect(scan(`[Example](${href})`)).toContainEqual({
        rule: 'internal security register ID',
        location: 'body.content.0.content.0.marks.0.attrs.href',
      });
    }
  );

  it('rejects a malformed escape beside an encoded register ID', () => {
    const findings = scan(
      '[Example](https://example.com/?q=%zz&ref=%2553%2552%252D123)'
    );
    expect(findings).toContainEqual({
      rule: 'unsupported link',
      location: 'body.content.0.content.0.marks.0.attrs.href',
    });
    expect(findings.map(({ rule }) => rule)).not.toContain(
      'internal security register ID'
    );
  });

  it.each([
    ['repeated escaped percent', '%25'],
    ['repeated double-escaped percent', '%2525'],
  ])('decodes a 2 MB %s href in bounded time', (_case, unit) => {
    const value = unit.repeat(Math.ceil(2_000_000 / unit.length));
    expect(value.length).toBeGreaterThanOrEqual(2_000_000);
    const started = performance.now();
    let decoded = value;
    for (let pass = 0; pass < 3 && decoded.includes('%'); pass++) {
      const next = decodeWikiHrefPass(decoded, pass);
      if (next === decoded) break;
      decoded = next;
    }
    expect(performance.now() - started).toBeLessThan(2000);
    expect(decoded).toBe('%'.repeat(value.length / unit.length));
  });

  it.each(['a:b', 'aa:bb', '12:34'])(
    'skips IPv6 parsing for single-colon token %s',
    (token) => {
      const canParse = vi.spyOn(URL, 'canParse');
      try {
        expect(
          scanPublicSafety({ type: 'doc' }, undefined, { title: token })
        ).toEqual([]);
        expect(canParse).not.toHaveBeenCalled();
      } finally {
        canParse.mockRestore();
      }
    }
  );

  it.each([
    ['short colon pairs', 'a:b '.repeat(499_000)],
    ['long colon pairs', 'aa:bb '.repeat(333_000)],
    ['long prose token', 'a'.repeat(1_999_800)],
    ['long hyphenated token', 'a-'.repeat(999_900)],
    [
      'dense host labels and assignment name',
      'one.'.repeat(250_000) + 'A'.repeat(999_800),
    ],
  ])('keeps near-limit scan time bounded for %s', (_case, value) => {
    const body = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: value }] },
      ],
    };
    const started = performance.now();
    expect(scanPublicSafety(body)).toEqual([]);
    expect(performance.now() - started).toBeLessThan(2000);
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
