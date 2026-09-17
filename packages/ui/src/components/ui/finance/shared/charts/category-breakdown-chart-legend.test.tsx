import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CategoryBreakdownLegend } from './category-breakdown-chart-legend';

describe('category legend', () => {
  it('toggles a category by stable id and exposes visibility to keyboard users', () => {
    const toggle = vi.fn();
    render(
      <CategoryBreakdownLegend
        categories={[
          {
            key: 'a',
            id: 'a',
            name: 'Office',
            total: 50,
            color: 'var(--chart-1)',
          },
        ]}
        hiddenCategories={new Set(['a'])}
        onToggleCategory={toggle}
        formatValue={() => '•••'}
      />
    );
    const button = screen.getByRole('button', { name: 'Office •••' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    expect(toggle).toHaveBeenCalledWith('a');
    expect(screen.queryByText('50')).toBeNull();
  });
});
