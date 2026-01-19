import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SceneIIGathering } from './scene-ii-gathering';

describe('SceneIIGathering', () => {
  it('renders the mission statement', () => {
    render(<SceneIIGathering />);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.textContent).toMatch(/No student founder.*builds alone/i);
  });
});
