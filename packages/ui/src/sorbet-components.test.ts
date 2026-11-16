import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = existsSync(resolve(process.cwd(), 'packages/ui/package.json'))
  ? process.cwd()
  : resolve(process.cwd(), '../..');

function readUiFile(name: string) {
  return readFileSync(resolve(repoRoot, 'packages/ui/src', name), 'utf8');
}

const css = readUiFile('sorbet-components.css').replace(
  /\/\*[\s\S]*?\*\//g,
  ''
);

/** Selector lists of every style rule, including those nested in @media. */
function ruleSelectors(source: string): string[] {
  const selectors: string[] = [];
  for (const match of source.matchAll(/([^{};]+)\{/g)) {
    const selector = match[1]!.trim();
    if (selector.startsWith('@')) continue;
    selectors.push(selector.replace(/\s+/g, ' '));
  }
  return selectors;
}

describe('Sorbet components', () => {
  it('scopes every rule to the Sorbet design, leaving classic unchanged', () => {
    const selectors = ruleSelectors(css);
    expect(selectors.length).toBeGreaterThan(5);
    for (const selector of selectors) {
      expect(selector, selector).toMatch(/^:root\[data-ui="sorbet"\]/);
      expect(selector, selector).not.toMatch(/,(?!\s*(?:\[|\.|:not|\)))/);
    }
  });

  it('stops the skeleton pulse when motion is reduced', () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\[data-slot="skeleton"\][\s\S]*animation: none/
    );
  });

  it('gives every interactive primitive here the solid focus ring', () => {
    const focus =
      /:where\(([^)]*)\):focus-visible\s*\{\s*outline: 2px solid var\(--ring\);\s*outline-offset: 2px;/.exec(
        css
      );
    expect(focus).not.toBeNull();
    for (const slot of [
      'accordion-trigger',
      'pagination-link',
      'toggle-group-item',
      'slider-thumb',
      'checkbox',
      'radio-group-item',
    ]) {
      expect(focus![1]).toContain(`[data-slot="${slot}"]`);
    }
  });

  it('reads only shared tokens, never raw colours', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  });

  it('targets data hooks that the primitives render', () => {
    const sources = ['alert.tsx', 'calendar.tsx', 'button.tsx'].map((name) =>
      readUiFile(`components/ui/${name}`)
    );
    expect(sources[0]).toContain('data-slot="alert"');
    expect(sources[0]).toContain('data-variant={variant');
    expect(sources[1]).toContain('data-slot="calendar"');
    expect(sources[2]).toContain("data-variant={variant ?? 'default'}");
  });

  it('loads after the Sorbet palettes and surfaces', () => {
    const globals = readUiFile('globals.css');
    expect(
      globals.indexOf('@import "./sorbet-components.css";')
    ).toBeGreaterThan(globals.indexOf('@import "./sorbet-surfaces.css";'));
  });
});
