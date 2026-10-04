import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import viMessages from '../../../messages/vi.json';

const source = (name: string) =>
  readFileSync(new URL(name, import.meta.url), 'utf8');
describe('season merge narrow-screen and bilingual contracts', () => {
  it('uses pinned safe-area shell, focusable selectors and minimum touch targets', () => {
    const dialog = source('./inventory-season-merge-dialog.tsx');
    const shell = source('./operator-dialog-shell.tsx');
    expect(dialog).toContain('mobileFullscreen');
    expect(dialog).toContain('onOpenAutoFocus');
    expect(dialog).toContain('\'[role="combobox"]\'');
    expect(dialog).toContain('min-h-11');
    expect(dialog).toContain('showCloseButton={false}');
    expect(dialog).toContain('size-11 touch-manipulation');
    expect(dialog).toContain('max-w-[calc(100vw-2rem)]');
    expect(dialog).toContain('min-w-0');
    expect(dialog).toContain('[overflow-wrap:anywhere]');
    expect(shell).toContain('overflow-y-auto');
    expect(shell).toContain('env(safe-area-inset-bottom)');
  });
  it('ships matching EN/VI keys and ICU plural forms for all counts', () => {
    const english = en.inventory.operator.seasonMerge;
    const vietnamese = viMessages.inventory.operator.seasonMerge;
    expect(Object.keys(english).sort()).toEqual(Object.keys(vietnamese).sort());
    for (const key of [
      'ruleCount',
      'prices',
      'conflicts',
      'ruleBlocked',
      'retainedHistory',
    ] as const) {
      expect(english[key]).toContain('plural,');
      expect(english[key]).toContain('one {');
      expect(english[key]).toContain('other {');
      expect(vietnamese[key]).toContain('plural, other {');
    }
  });
});
