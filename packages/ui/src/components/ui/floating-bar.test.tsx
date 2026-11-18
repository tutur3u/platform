import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import {
  FloatingBar,
  FloatingBarGroup,
  FloatingBarSeparator,
} from './floating-bar';
import { Tabs, TabsList, TabsTrigger } from './tabs';

const read = (path: string) =>
  readFileSync(resolve(__dirname, path), 'utf8').replace(/\s+/g, ' ');

const css = read('../../floating-bar.css');

// Floating bars outside packages/ui that must use the shared tokens.
const BAR_SURFACES = [
  '../../../../hive-ui/src/components/hive/panels/tool-dock.tsx',
  '../../../../hive-ui/src/components/hive/hive-top-right-toolbar.tsx',
  '../../../../mind-ui/src/components/mind/mind-canvas-toolbar.tsx',
  '../../../../mind-ui/src/components/mind/mind-dashboard.tsx',
  '../../../../mind-ui/src/components/mind/mind-auto-save-island.tsx',
  '../../../../../apps/drive/src/app/[locale]/(dashboard)/[wsId]/drive/drive-selection-bar.tsx',
];

describe('floating bar tokens', () => {
  it('derives every inner radius from the outer radius and padding', () => {
    expect(css).toContain(
      '--radius-bar: min( var(--bar-radius-max), calc(var(--bar-control-height) / 2 + var(--bar-padding)) );'
    );
    expect(css).toContain('--bar-radius-max: 9999px;');
    expect(css).toContain(
      '--radius-bar-inner: max( 0.125rem, calc(var(--radius-bar) - var(--bar-padding)) );'
    );
    expect(css).toContain(
      '--radius-segment-inner: max( 0.125rem, calc(var(--radius-segment) - var(--segment-padding)) );'
    );
    expect(css).toContain(
      '--bar-separator-margin: calc(var(--bar-padding) - var(--bar-gap));'
    );
  });

  it('recomputes every derived value on each bar, below utilities', () => {
    const base = css.slice(css.indexOf('@layer base {'));
    const bar = base.slice(
      base.indexOf(':where([data-slot="floating-bar"])'),
      base.indexOf(':where([data-slot="tabs-list"])')
    );
    for (const name of [
      '--bar-separator-margin:',
      '--radius-bar:',
      '--radius-bar-inner:',
    ])
      expect(bar).toContain(name);
    expect(base).toContain(':where([data-slot="tabs-list"])');
  });

  it('keeps bar controls concentric under Sorbet pill controls', () => {
    expect(css).toMatch(
      /:root\[data-ui="sorbet"\] :where\(\[data-slot="floating-bar"\]\) :where\( \[data-slot="button"\],[^{]*\) \{ border-radius: var\(--radius-bar-inner\); \}/
    );
  });

  it('is loaded by the shared stylesheet', () => {
    expect(read('../../globals.css')).toContain(
      '@import "./floating-bar.css";'
    );
  });

  it('lets Sorbet set only the track radius for tabs', () => {
    const sorbet = read('../../sorbet-surfaces.css');
    expect(sorbet).toContain('--radius-segment: var(--sorbet-control-radius);');
    expect(sorbet).toContain('border-radius: var(--radius-segment-inner);');
    expect(sorbet).not.toMatch(/sorbet-control-radius\) - 4px/);
  });

  it.each(BAR_SURFACES)('%s uses FloatingBar', (file) => {
    const source = read(file);
    expect(source).toContain("from '@tuturuuu/ui/floating-bar'");
    expect(source).not.toMatch(/rounded-md border transition/);
  });
});

describe('FloatingBar', () => {
  it('renders a toolbar whose controls take the concentric tokens', () => {
    render(
      <FloatingBar aria-label="Message actions">
        <Button size="sm">Reply</Button>
        <FloatingBarSeparator data-testid="separator" />
        <FloatingBarGroup aria-label="Appearance">
          <Button aria-label="Dark" size="icon" />
        </FloatingBarGroup>
      </FloatingBar>
    );
    const bar = screen.getByRole('toolbar', { name: 'Message actions' });
    expect(bar).toHaveAttribute('data-slot', 'floating-bar');
    for (const token of [
      'rounded-(--radius-bar)',
      'p-(--bar-padding)',
      'gap-(--bar-gap)',
      '**:data-[slot=button]:rounded-(--radius-bar-inner)',
      '**:data-[slot=button]:h-(--bar-control-height)',
      '**:data-[slot=button]:data-[size=icon]:w-(--bar-control-height)',
    ])
      expect(bar.className).toContain(token);
    // A layout border would add to the inset and break the radius relation.
    expect(bar.className).not.toMatch(/(^|\s)border(\s|$)/);

    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute(
      'data-size',
      'icon'
    );
    expect(screen.getByRole('group', { name: 'Appearance' })).toHaveAttribute(
      'data-slot',
      'floating-bar-group'
    );
    const separator = screen.getByTestId('separator');
    expect(separator).toHaveAttribute('aria-hidden', 'true');
    expect(separator.className).toContain('h-(--bar-separator-height)');
    expect(separator.className).toContain('mx-(--bar-separator-margin)');
  });

  it('gives tabs a concentric track and triggers', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
      </Tabs>
    );
    const list = screen.getByRole('tablist');
    expect(list.className).toContain('rounded-(--radius-segment)');
    expect(list.className).toContain('p-(--segment-padding)');
    const trigger = screen.getByRole('tab');
    expect(trigger.className).toContain('rounded-(--radius-segment-inner)');
    // The trigger fills the track's height, so a list with a taller height
    // still keeps the same padding above and below it as at the sides.
    expect(trigger.className).toContain('self-stretch');
    expect(trigger.className).not.toMatch(/(^|\s)h-/);
  });
});
