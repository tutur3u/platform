import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SceneIVHunt } from './scene-iv-hunt';

describe('SceneIVHunt', () => {
  it('renders the impact pitch', () => {
    render(<SceneIVHunt />);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.textContent).toMatch(/Pack Emblems/i);
  });
});
