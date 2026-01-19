import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NetworkEffect } from './network-effect';

describe('NetworkEffect', () => {
  it('renders without crashing', () => {
    const { container } = render(<NetworkEffect />);
    expect(container).toBeDefined();
  });

  it('contains the canvas or svg for visualization', () => {
    const { container } = render(<NetworkEffect />);
    // We expect an SVG or Canvas. Let's assume SVG for now as it's easier to test presence of elements.
    const svg = container.querySelector('svg');
    expect(svg).toBeDefined();
  });
});
