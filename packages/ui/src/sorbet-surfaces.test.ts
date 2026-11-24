import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = existsSync(resolve(process.cwd(), 'packages/ui/package.json'))
  ? process.cwd()
  : resolve(process.cwd(), '../..');

function readUiFile(name: string) {
  return readFileSync(resolve(repoRoot, 'packages/ui/src', name), 'utf8');
}

const css = readUiFile('sorbet-surfaces.css').replace(/\/\*[\s\S]*?\*\//g, '');

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

describe('Sorbet surfaces', () => {
  it('scopes every rule to the Sorbet design, leaving classic unchanged', () => {
    const selectors = ruleSelectors(css);
    expect(selectors.length).toBeGreaterThan(5);
    for (const selector of selectors) {
      expect(selector, selector).toMatch(/^:root\[data-ui="sorbet"\]/);
      expect(selector, selector).not.toMatch(/,(?!\s*(?:\[|\.|:not|\)))/);
    }
  });

  it('turns transitions off when motion is reduced', () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*--control-duration: 0ms/
    );
  });

  it('sets control motion and the tabs thumb through variables', () => {
    expect(css).toContain(
      '--control-transition: background-color, border-color, color, box-shadow;'
    );
    expect(css).toContain('--control-duration: var(--sorbet-duration-fast);');
    expect(css).toContain('--tabs-thumb-shadow: var(--sorbet-shadow-sm);');
    expect(css).toMatch(
      /\[data-slot="tabs-trigger"\]\) \{\s*--tabs-thumb-bg: var\(--card\);/
    );
    expect(css).toMatch(
      /\.dark :where\(\[data-slot="tabs-trigger"\]\) \{\s*--tabs-thumb-bg: color-mix/
    );
    // The sidebar menu button keeps its own width and padding transition.
    expect(css).not.toMatch(/transition-property/);
  });

  it('gives navigation, tabs and switches a visible focus ring', () => {
    expect(css).toMatch(
      /\[data-slot="sidebar-menu-button"\],\s*\[data-slot="tabs-trigger"\],\s*\[data-slot="switch"\]\s*\):focus-visible\s*\{\s*outline: 2px solid var\(--ring\)/
    );
  });

  it('marks the active settings tab with a fill, not an edge accent', () => {
    const activeRule = css.match(
      /\[data-settings-pane="nav"\]\s*\[data-slot="sidebar-menu-button"\]\[data-active="true"\]\s*\)\s*\{([^}]*)\}/
    );
    expect(activeRule?.[1]).toContain(
      'background-color: var(--sidebar-accent)'
    );
    expect(activeRule?.[1]).not.toMatch(/box-shadow|border-left/);
  });

  it('centers the dock pill without a separate back lane on web', () => {
    expect(css).toMatch(
      /\[data-slot="mobile-dock"\][\s\S]*justify-content: center/
    );
    expect(css).not.toMatch(/mobile-dock-back-lane/);
    expect(css).toMatch(
      /\[data-slot="mobile-dock-pill"\][\s\S]*background-color: var\(--card\)/
    );
  });

  it('aligns structure content with the mobile gutter and flattens embed shells', () => {
    expect(css).toMatch(
      /\[data-slot="structure-content"\][\s\S]*padding-bottom: var\(--sorbet-content-bottom-clearance\)/
    );
    expect(css).toMatch(
      /\[data-slot="structure-content"\]:not\(\[data-content-full-bleed="true"\]\)[\s\S]*padding-inline: var\(--sorbet-gutter\)/
    );
    expect(css).toMatch(
      /\[class~="-m-2"\][\s\S]*margin-inline: calc\(-1 \* var\(--sorbet-gutter\)\)/
    );
    expect(css).toMatch(
      /\.dashboard-embed-shell\)[\s\S]*margin-inline: calc\(-1 \* var\(--sorbet-gutter\)\)/
    );
  });

  it('publishes the dock clearance for viewport-height composers', () => {
    expect(css).toMatch(
      /:root\[data-ui="sorbet"\]:has\(\[data-slot="mobile-dock"\]\)\s*\{\s*--mobile-dock-clearance: var\(--sorbet-content-bottom-clearance\);/
    );
  });

  it('loads after the Sorbet palettes', () => {
    const globals = readUiFile('globals.css');
    expect(globals.indexOf('@import "./sorbet-surfaces.css";')).toBeGreaterThan(
      globals.indexOf('@import "./sorbet-presets.css";')
    );
  });
});
