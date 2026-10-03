import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// jsdom cannot calculate scrolling or safe areas. Protect the layout contract;
// actual 320–768px scrolling and focus behavior still require browser verification.
const source = (name: string) =>
  readFileSync(new URL(name, import.meta.url), 'utf8');
describe('narrow merge dialog layout contracts', () => {
  it('contains the body scroll and pins safe-area actions inside a viewport-bounded shell', () => {
    const shell = source('./operator-dialog-shell.tsx');
    expect(shell).toContain('flex max-h-[calc(100dvh-1rem)] flex-col');
    expect(shell).toContain(
      'min-h-0 flex-1 overflow-y-auto overscroll-contain'
    );
    expect(shell).toContain('flex shrink-0 flex-col-reverse');
    expect(shell).toContain('env(safe-area-inset-bottom)');
    const merge = source('./inventory-merge-dialog.tsx');
    expect(merge).toContain('mobileFullscreen');
    expect(merge).toContain('grid min-w-0 content-start');
    expect(merge).toContain('[overflow-wrap:anywhere]');
    expect(source('./inventory-merge-preview.tsx')).toContain(
      '[overflow-wrap:anywhere]'
    );
  });
  it('focuses a non-text selector on open and supplies 44px touch controls', () => {
    const merge = source('./inventory-merge-dialog.tsx');
    expect(merge).toContain('onOpenAutoFocus');
    expect(merge).toContain(`.querySelector<HTMLElement>('[role="combobox"]')`);
    expect(merge).toContain('?.focus()');
    expect(merge).toContain('min-h-11 w-full touch-manipulation');
    expect(merge).toContain('htmlFor={confirmationId}');
    expect(merge).toContain('id={confirmationId}');
    const choices = source('./inventory-merge-product-options.tsx');
    expect(choices).toContain('max-w-[calc(100vw-2rem)]');
    expect(choices).toContain('[&_button[role=combobox]]:min-h-11');
    expect(choices).toContain('[&_[cmdk-item]]:min-h-11');
  });
});
