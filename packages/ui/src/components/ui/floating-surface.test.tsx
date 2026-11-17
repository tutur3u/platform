import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';

const FLOATING_SURFACES = [
  'dropdown-menu.tsx',
  'context-menu.tsx',
  'popover.tsx',
  'select.tsx',
  'command.tsx',
  'menubar.tsx',
  'hover-card.tsx',
  'tooltip.tsx',
];

const css = readFileSync(
  resolve(__dirname, '../../floating-surface.css'),
  'utf8'
);

describe('floating surface radius', () => {
  it.each(FLOATING_SURFACES)('%s uses the shared radius tokens', (file) => {
    const source = readFileSync(resolve(__dirname, file), 'utf8');
    expect(source).toContain('rounded-(--radius-popover)');
    expect(source).not.toMatch(/\brounded-(sm|xs)\b.*py-1\.5/);
    expect(source).not.toContain('-mx-1');
  });

  it('derives the inner radius from the container radius and padding', () => {
    const compact = css.replace(/\s+/g, ' ');
    expect(compact).toContain(
      '--radius-inner: max( 0.125rem, calc(var(--radius-popover) - var(--popover-padding)) );'
    );
    for (const shape of ['sharp', 'round']) {
      expect(compact).toContain(
        `[data-sorbet-radius="${shape}"] { --radius-popover:`
      );
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps menu rows and separators inside the padding', () => {
    // Radix measures the popper with ResizeObserver, which jsdom lacks.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Rename</DropdownMenuItem>
          <DropdownMenuSeparator data-testid="separator" />
          <DropdownMenuCheckboxItem checked>Pinned</DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    const content = screen.getByRole('menu');
    expect(content.className).toContain('rounded-(--radius-popover)');
    expect(content.className).toContain('p-(--popover-padding)');

    for (const row of [
      screen.getByRole('menuitem', { name: 'Rename' }),
      screen.getByRole('menuitemcheckbox', { name: 'Pinned' }),
    ]) {
      expect(row.className).toContain('rounded-(--radius-inner)');
      expect(row.className).not.toMatch(/\brounded-(sm|md)\b/);
    }

    expect(screen.getByTestId('separator').className).not.toContain('-mx-1');
  });

  it('lets a padded panel keep its padding for the inner radius', () => {
    const popover = readFileSync(resolve(__dirname, 'popover.tsx'), 'utf8');
    expect(popover).toContain('[--popover-padding:1rem]');
    expect(css).toContain('[data-slot="popover-content"]');
  });
});

describe('sonner toast skin', () => {
  const compact = css.replace(/\s+/g, ' ');
  const toastRules = compact
    .split('}')
    .filter((rule) => rule.includes('[data-sonner-toast]'));

  it('uses the neutral popover surface and border for every type', () => {
    expect(compact).toContain('--normal-bg: var(--popover);');
    expect(compact).toContain('--normal-border: var(--border);');
    for (const type of ['success', 'info', 'warning', 'error']) {
      const typeRules = toastRules.filter((rule) =>
        rule.includes(`[data-type="${type}"]`)
      );
      for (const rule of typeRules) {
        expect(rule).not.toMatch(/background(-color)?:/);
      }
    }
    expect(
      readFileSync(resolve(__dirname, 'sonner.tsx'), 'utf8')
    ).not.toContain('richColors');
  });

  it('tints only the error border', () => {
    expect(compact).toContain(
      '[data-sonner-toast][data-type="error"]:not([data-rich-colors="true"]) { border-color: color-mix(in oklab, var(--red) 35%, var(--border));'
    );
  });

  it('falls back to classic values when Sorbet tokens are absent', () => {
    for (const rule of toastRules) {
      for (const token of rule.match(/var\( ?--sorbet-[a-z-]+ ?[,)]/g) ?? []) {
        expect(token.trimEnd().endsWith(',')).toBe(true);
      }
    }
    expect(compact).toContain(
      'box-shadow: var( --sorbet-shadow-lg, var( --shadow-lg,'
    );
    expect(compact).toContain(
      'transition-timing-function: var(--sorbet-ease-emphasized, ease-out);'
    );
    const skin = toastRules.find((rule) => rule.includes('--sorbet-shadow-lg'));
    expect(skin).not.toContain('data-ui');
  });

  it('keeps the close button reachable on touch and stops motion on request', () => {
    expect(compact).toContain(
      '[data-sonner-toast][data-styled="true"]:is(:hover, :focus-within) [data-close-button] { opacity: 1;'
    );
    expect(compact).toMatch(
      /@media \(hover: none\) \{[^}]*\[data-close-button\] \{ opacity: 1;/
    );
    expect(compact).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{.*\[data-icon\] svg \{ animation: none;/
    );
  });

  it('lifts the stack above the Sorbet dock only where the dock shows', () => {
    expect(compact).toMatch(
      /@media \(max-width: 767\.98px\) \{ :root\[data-ui="sorbet"\]:has\(\[data-slot="mobile-dock"\]\) \[data-sonner-toaster\]\[data-y-position="bottom"\] \{ bottom: calc\( var\(--sorbet-content-bottom-clearance\) \+ 1rem - var\(--mobile-dock-viewport-drop, 0px\) \);/
    );
    // Sonner's own z-index already clears the dock and every app overlay.
    expect(compact).not.toMatch(/\[data-sonner-toaster\][^{]*\{[^}]*z-index/);
  });
});
