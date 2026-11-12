// @vitest-environment node
import { expect, it } from 'vitest';
import { criticalCss } from './landing-critical-css.mjs';
import { landingStyles } from '../src/lib/landing-styles';
it('keeps first-paint utilities, tokens and fonts while excluding below-fold rules', () => {
  const css =
    '@layer theme{:root{--ink:black;--unused:orange}}@font-face{font-family:Brand;font-display:swap}@layer utilities{.hero{color:var(--ink)}.below{display:grid}@media(min-width:640px){.sm\\:large{font-size:3rem}}}';
  const critical = criticalCss(css, 'hero sm:large');
  expect(critical).toContain('.hero');
  expect(critical).toContain('sm\\:large');
  expect(critical).toContain('--ink');
  expect(critical).toContain('font-display:swap');
  expect(critical).not.toContain('.below');
  expect(critical).not.toContain('--unused');
});
it('rewrites HTML and serialized RSC identity; complete CSS is non-blocking with a no-JS fallback', () => {
  const html =
    '<head><link rel="stylesheet" href="/assets/layout-abcd.css"></head><script>"/assets/layout-abcd.css"</script>';
  const result = landingStyles(html, {
    '/assets/layout-abcd.css': {
      critical: '/assets/critical-xyz.css',
      remaining: '/assets/rest-xyz.css',
    },
  });
  expect(result).toContain('<script>"/assets/critical-xyz.css"</script>');
  expect(result).toContain('media="print" fetchpriority="low"');
  expect(result).toContain(
    '<noscript><link rel="stylesheet" href="/assets/layout-abcd.css">'
  );
  expect(result).not.toContain('unsafe-inline');
  expect(result).not.toContain('onload=');
  expect(result).not.toContain('prefetch');
});
it('preserves mount paths and leaves unrelated styles intact', () => {
  const result = landingStyles(
    '<head><link href="/marketing/assets/layout-a.css"><link href="/assets/legal.css"></head>',
    {
      '/assets/layout-a.css': {
        critical: '/assets/critical-a.css',
        remaining: '/assets/rest-a.css',
      },
    }
  );
  expect(result).toContain('/marketing/assets/critical-a.css');
  expect(result).toContain('href="/marketing/assets/layout-a.css"');
  expect(result).toContain('/assets/legal.css');
});

it('keeps CSP-bearing scripts unchanged while dropping only module resource hints', () => {
  const input =
    '<head><link rel="modulepreload" href="/app.js"><link rel="preload" as="image" href="/poster.webp"></head><script nonce="existing" type="module" src="/app.js"></script>';
  const output = landingStyles(input, {});
  expect(output).not.toContain('modulepreload');
  expect(output).toContain('rel="preload" as="image"');
  expect(output).toContain('nonce="existing"');
  expect(output).toContain('fetchpriority="low"');
});
it('does not confuse a utility with a substring of a different utility', () => {
  expect(
    criticalCss('.p-1{padding:4px}.p-1\\.5{padding:6px}', 'p-1.5')
  ).not.toContain('.p-1{');
});
