import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AlphaConstellation } from './alpha-constellation';

describe('AlphaConstellation', () => {
  it('renders founder names', () => {
    render(<AlphaConstellation />);
    expect(screen.getByText(/Phuc/i)).toBeDefined();
    expect(screen.getByText(/Tien/i)).toBeDefined();
    // Nghi appears twice, so getAllByText might be needed or just getByText finds one
    expect(screen.getAllByText(/Nghi/i).length).toBeGreaterThan(0);
  });
});
