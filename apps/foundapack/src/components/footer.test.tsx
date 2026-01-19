import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Footer } from './footer';

describe('Footer', () => {
  it('renders Foundapack and Tuturuuu', () => {
    render(<Footer />);
    expect(screen.getAllByText(/Foundapack/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Tuturuuu/i).length).toBeGreaterThan(0);
  });
});
