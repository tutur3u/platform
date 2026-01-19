import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SceneITundra } from './scene-i-tundra';

describe('SceneITundra', () => {
  it('renders the core message', () => {
    render(<SceneITundra />);
    // Check for the heading which contains the text broken by spans
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.textContent).toMatch(/The hardest walk is walking alone/i);
  });
});
