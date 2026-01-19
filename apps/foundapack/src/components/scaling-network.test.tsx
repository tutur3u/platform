import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScalingNetwork } from './scaling-network';

// Mock framer-motion useScroll to return actual MotionValues
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<any>('framer-motion');
  return {
    ...actual,
    useScroll: () => ({
      scrollYProgress: actual.motionValue(0),
      scrollY: actual.motionValue(0),
    }),
  };
});

describe('ScalingNetwork', () => {
  it('renders without crashing', () => {
    const { container } = render(<ScalingNetwork />);
    expect(container).toBeDefined();
  });

  it('contains the visualization container', () => {
    const { container } = render(<ScalingNetwork />);
    // Search for the viz class anywhere in the output
    const vizContainer = container.querySelector('[class*="scaling-network-viz"]');
    expect(vizContainer).toBeDefined();
  });
});
