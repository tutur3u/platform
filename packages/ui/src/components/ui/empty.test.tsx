import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Empty } from './empty';

describe('Empty', () => {
  it('renders the title as a paragraph by default', () => {
    render(<Empty title="No files yet" />);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('No files yet').tagName).toBe('P');
  });

  it.each([2, 3, 6] as const)(
    'renders the title as a level %i heading when asked',
    (level) => {
      render(<Empty headingLevel={level} title="No files yet" />);
      expect(
        screen.getByRole('heading', { level, name: 'No files yet' })
      ).toHaveAttribute('data-slot', 'empty-title');
    }
  );
});
