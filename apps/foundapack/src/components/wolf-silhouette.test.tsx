import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WolfSilhouette } from './wolf-silhouette';

describe('WolfSilhouette', () => {
  it('renders correctly', () => {
    const { container } = render(<WolfSilhouette />);
    expect(container.querySelector('svg')).toBeDefined();
  });
});
