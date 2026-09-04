import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ColorPicker } from './color-picker';

vi.mock('../../hooks/use-dom-resolved-theme', () => ({
  useDomResolvedTheme: () => 'light',
}));

describe('ColorPicker', () => {
  it('renders the supplied read-only label', () => {
    render(<ColorPicker text="Visible workspace tag" value="#123456" />);

    expect(
      screen.getByRole('button', { name: 'Visible workspace tag' })
    ).toBeVisible();
  });

  it('keeps the icon-only control when no label is supplied', () => {
    const { container } = render(<ColorPicker value="#123456" />);

    expect(container.querySelector('button svg')).toBeTruthy();
  });
});
