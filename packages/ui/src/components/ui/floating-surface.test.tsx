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
        `[data-sorbet-radius='${shape}'] { --radius-popover:`
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
    expect(css).toContain("[data-slot='popover-content']");
  });
});
