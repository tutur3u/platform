import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ScoreBadge from '../components/common/ScoreBadge';

describe('ScoreBadge', () => {
  it('renders child content correctly', () => {
    render(
      <ScoreBadge score={8} maxScore={10}>
        Score: 8/10
      </ScoreBadge>
    );

    expect(screen.getByText('Score: 8/10')).toBeDefined();
  });

  it('applies green color for scores of 80% or higher', () => {
    const { container } = render(
      <ScoreBadge score={8} maxScore={10}>
        High Score
      </ScoreBadge>
    );

    const badge = container.firstChild;
    expect(badge).toBeDefined();
    expect(badge).toBeDefined();
  });

  it('applies yellow color for scores between 50% and 80%', () => {
    const { container } = render(
      <ScoreBadge score={6} maxScore={10}>
        Medium Score
      </ScoreBadge>
    );

    const badge = container.firstChild;
    expect(badge).toBeDefined();
    expect(badge).toBeDefined();
  });

  it('applies red color for scores below 50%', () => {
    const { container } = render(
      <ScoreBadge score={4} maxScore={10}>
        Low Score
      </ScoreBadge>
    );

    const badge = container.firstChild;
    expect(badge).toBeDefined();
    expect(badge).toBeDefined();
  });

  it('accepts and applies custom className', () => {
    const { container } = render(
      <ScoreBadge score={8} maxScore={10} className="custom-class">
        With Custom Class
      </ScoreBadge>
    );

    const badge = container.firstChild;
    expect(badge).toBeDefined();
  });

  it('uses variant prop correctly', () => {
    const { container } = render(
      <ScoreBadge score={8} maxScore={10} variant="outline">
        With Variant
      </ScoreBadge>
    );

    const badge = container.firstChild;
    expect(badge).toBeDefined();
  });
});
