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

// Mock heavy visual background components
vi.mock('../components/night-sky', () => ({
  NightSky: () => <div data-testid="night-sky" />,
}));

vi.mock('../components/pack-background', () => ({
  PackBackground: () => <div data-testid="pack-background" />,
}));

vi.mock('../components/atmospheric-pass', () => ({
  AtmosphericPass: () => <div data-testid="atmospheric-pass" />,
}));

// Mock Scene I because it has 90+ motion components and complex logic
vi.mock('../components/scene-i-tundra', () => ({
  SceneITundra: () => <div>Find your pack</div>,
}));

// Mock ScalingNetwork because it uses useScroll and complex layout
vi.mock('../components/scaling-network', () => ({
  ScalingNetwork: () => <div>ScalingNetwork Component</div>,
}));

// Mock TheCouncil
vi.mock('../components/the-council', () => ({
  TheCouncil: () => <div>The Council Component</div>,
}));

describe('Foundapack Landing Page', () => {
  it('renders all main sections', () => {
    render(<Page />);

    // Scene I
    expect(screen.getByText(/Find your pack/i)).toBeDefined();

    // ScalingNetwork
    expect(screen.getByText('ScalingNetwork Component')).toBeDefined();

    // Scene III
    expect(screen.getByText(/Iron sharpens iron/i)).toBeDefined();

    // The Council
    expect(screen.getByText('The Council Component')).toBeDefined();

    // Scene V
    expect(screen.getByText(/The fire is lit/i)).toBeDefined();

    // Footer (Checking for the brand name in the footer)
    expect(screen.getAllByText(/Foundapack/i).length).toBeGreaterThan(0);
  });
});
