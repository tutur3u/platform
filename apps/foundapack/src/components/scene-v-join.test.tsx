import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SceneVJoin } from './scene-v-join';

describe('SceneVJoin', () => {
  it('renders the CTA button', () => {
    render(<SceneVJoin />);
    expect(screen.getByRole('link', { name: /Join the Pack/i })).toBeDefined();
  });
});
