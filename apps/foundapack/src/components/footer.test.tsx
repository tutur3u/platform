import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Footer } from './footer';

describe('Footer', () => {
  it('renders Powered by Tuturuuu', () => {
    render(<Footer />);
    expect(screen.getByText(/Powered by Tuturuuu/i)).toBeDefined();
  });
});
