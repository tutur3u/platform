import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import messages from '../../../messages/en.json';
import { PortfolioAtlas } from './portfolio-atlas';

describe('portfolio connected-work walkthrough', () => {
  it('lets visitors inspect a different product contribution without navigation', () => {
    render(<PortfolioAtlas copy={messages.portfolio} apps={[]} />);
    expect(
      screen.getByRole('heading', {
        name: messages.portfolio.atlas.steps[0]!.title,
      })
    ).toBeDefined();
    const mira = screen.getByRole('button', { name: /Mira/ });
    fireEvent.click(mira);
    expect(mira.getAttribute('aria-pressed')).toBe('true');
    expect(
      screen.getByRole('button', { name: /Mail/ }).getAttribute('aria-pressed')
    ).toBe('false');
    expect(
      screen.getByRole('heading', {
        name: messages.portfolio.atlas.steps[5]!.title,
      })
    ).toBeDefined();
    expect(
      screen.getByText(messages.portfolio.atlas.steps[5]!.body)
    ).toBeDefined();
  });
});
