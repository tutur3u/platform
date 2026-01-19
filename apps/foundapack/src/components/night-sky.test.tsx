import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NightSky } from './night-sky';

describe('NightSky', () => {
  it('renders without crashing', () => {
    const { container } = render(<NightSky />);
    expect(container).toBeDefined();
  });

  it('contains the necessary layers', () => {
    const { container } = render(<NightSky />);
    const starLayer = container.querySelector('.pack-stars');
    expect(starLayer).toBeDefined();
  });
});
