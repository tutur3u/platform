import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Sheet, SheetContent, SheetTitle } from './sheet';

function renderSheet(
  side: 'top' | 'right' | 'bottom' | 'left',
  className?: string
) {
  render(
    <Sheet open>
      <SheetContent side={side} className={className}>
        <SheetTitle>Sheet</SheetTitle>
      </SheetContent>
    </Sheet>
  );
  return screen.getByRole('dialog', { name: 'Sheet' });
}

describe('SheetContent safe areas', () => {
  it('keeps the notch and home-indicator insets when a caller removes padding', () => {
    const sheet = renderSheet('right', 'p-0');

    expect(sheet).toHaveClass('p-0');
    expect(sheet.style.getPropertyValue('--sheet-inset-top')).toContain(
      'env(safe-area-inset-top'
    );
    expect(sheet.style.getPropertyValue('--sheet-inset-bottom')).toContain(
      'env(safe-area-inset-bottom'
    );
  });

  it('insets a top sheet below the notch only', () => {
    const sheet = renderSheet('top');

    expect(sheet.style.getPropertyValue('--sheet-inset-top')).toContain(
      'env(safe-area-inset-top'
    );
    expect(sheet.style.getPropertyValue('--sheet-inset-bottom')).toBe('');
  });

  it('pads a bottom sheet for the home indicator without a top inset', () => {
    const sheet = renderSheet('bottom');

    expect(sheet).toHaveClass('pb-[env(safe-area-inset-bottom,0px)]');
    expect(sheet.style.getPropertyValue('--sheet-inset-top')).toBe('');
  });
});
