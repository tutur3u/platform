import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Page from './page';

// Mock framer-motion useScroll
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

// Mock ScalingNetwork because it uses useScroll and complex layout
vi.mock('../components/scaling-network', () => ({
  ScalingNetwork: () => <div>ScalingNetwork Component</div>,
}));

describe('Foundapack Landing Page', () => {
  it('renders all main sections', () => {
    render(<Page />);

    // Scene I
    expect(screen.getByText(/The hardest walk/i)).toBeDefined();

    // ScalingNetwork
    expect(screen.getByText('ScalingNetwork Component')).toBeDefined();

    // Scene III
    expect(screen.getByText(/Iron sharpens iron/i)).toBeDefined();

    // Scene V
    expect(screen.getByText(/The fire is lit/i)).toBeDefined();

    // Footer
    expect(screen.getByText(/Powered by Tuturuuu/i)).toBeDefined();
  });
});
