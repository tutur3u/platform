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
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition-duration: 0ms/
    );
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

  it('loads after the Sorbet palettes', () => {
    const globals = readUiFile('globals.css');
    expect(globals.indexOf('@import "./sorbet-surfaces.css";')).toBeGreaterThan(
      globals.indexOf('@import "./sorbet-presets.css";')
    );
  });
});
