import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import messages from '../../../messages/en.json';
import { MotionToggle, StoryMotion } from '../story/story-motion';
import { PortfolioInnovation } from './portfolio-innovation';

describe('innovation story', () => {
  it('changes the illustration and product story when a chapter receives keyboard focus', () => {
    render(<PortfolioInnovation copy={messages.portfolio.innovation} />);
    const first = screen.getByRole('tab', { name: /Useful products/ });
    expect(first.getAttribute('aria-selected')).toBe('true');
    const platform = screen.getByRole('tab', { name: /Shared foundations/ });
    fireEvent.focus(platform);
    expect(platform.getAttribute('aria-selected')).toBe('true');
    expect(
      screen.getByRole('img', {
        name: messages.portfolio.innovation.chapters[1]!.alt,
      })
    ).toBeDefined();
    expect(
      screen.queryByRole('img', {
        name: messages.portfolio.innovation.chapters[0]!.alt,
      })
    ).toBeNull();
  });

  it('lets a reader pause and resume motion without changing content', () => {
    const { container } = render(
      <StoryMotion>
        <p>Readable story</p>
        <MotionToggle copy={messages.portfolio.motion} />
      </StoryMotion>
    );
    fireEvent.click(
      screen.getByRole('button', { name: messages.portfolio.motion.pause })
    );
    expect(container.querySelector('[data-motion="paused"]')).not.toBeNull();
    expect(screen.getByText('Readable story')).toBeDefined();
    fireEvent.click(
      screen.getByRole('button', { name: messages.portfolio.motion.resume })
    );
    expect(container.querySelector('[data-motion="playing"]')).not.toBeNull();
  });
});
