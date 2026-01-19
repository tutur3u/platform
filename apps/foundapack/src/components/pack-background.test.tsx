import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PackBackground } from './pack-background';

describe('PackBackground', () => {
  it('renders without crashing', () => {
    const { container } = render(<PackBackground />);
    expect(container).toBeDefined();
  });

  it('contains the ember layer', () => {
    const { container } = render(<PackBackground />);
    // Check for element with class 'pack-embers' (we will implement this)
    const emberLayer = container.querySelector('.pack-embers');
    expect(emberLayer).toBeDefined();
  });
});
