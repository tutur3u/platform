import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SceneIIICampfire } from './scene-iii-campfire';

describe('SceneIIICampfire', () => {
  it('renders the campfire content', () => {
    render(<SceneIIICampfire />);
    expect(screen.getByText(/Iron sharpens iron/i)).toBeDefined();
  });
});
