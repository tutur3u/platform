import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InfiniteParticles } from './infinite-particles';

describe('InfiniteParticles', () => {
  it('renders a canvas', () => {
    const { container } = render(<InfiniteParticles />);
    expect(container.querySelector('canvas')).toBeDefined();
  });
});
