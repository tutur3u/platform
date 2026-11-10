import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import {
  FeatureStatusBadge,
  type FeatureStatusBadgeProps,
} from '@tuturuuu/ui/custom/feature-status-badge';

const labels = [
  ['experimental', 'en', 'Experimental'],
  ['beta', 'en', 'Beta'],
  ['experimental', 'vi', 'Thử nghiệm'],
  ['beta', 'vi', 'Beta'],
] as const;

describe('FeatureStatusBadge', () => {
  it.each(labels)('shows the %s label for %s', (variant, locale, label) => {
    render(<FeatureStatusBadge locale={locale} variant={variant} />);

    const badge = screen.getByText(label);
    expect(badge).toBeVisible();
    expect(badge.tagName).toBe('SPAN');
    expect(badge).toHaveAttribute('lang', locale);
    expect(badge).not.toHaveAttribute('role');
    expect(badge).not.toHaveAttribute('aria-live');
    expect(badge).not.toHaveAttribute('tabindex');
  });

  it('puts caller className, ref, and span props on the status element', () => {
    const ref = createRef<HTMLSpanElement>();

    render(
      <FeatureStatusBadge
        aria-describedby="calendar-status-hint"
        aria-label="Calendar feature status"
        className="ms-2"
        id="calendar-status"
        lang="en-US"
        locale="vi"
        ref={ref}
        title="Feature stage"
        variant="experimental"
      />
    );

    const badge = screen.getByLabelText('Calendar feature status');
    expect(badge).toBe(ref.current);
    expect(badge.tagName).toBe('SPAN');
    expect(badge).toHaveClass('ms-2');
    expect(badge).toHaveAttribute('id', 'calendar-status');
    expect(badge).toHaveAttribute('aria-describedby', 'calendar-status-hint');
    expect(badge).toHaveAttribute('lang', 'en-US');
    expect(badge).toHaveAttribute('title', 'Feature stage');
    expect(badge).toHaveTextContent('Thử nghiệm');
    expect(badge).not.toHaveAttribute('aria-live');
    expect(badge).not.toHaveAttribute('role');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps the visible status label when children are passed at runtime', () => {
    const Overridden = FeatureStatusBadge as (
      props: FeatureStatusBadgeProps & { children?: string }
    ) => ReturnType<typeof FeatureStatusBadge>;

    render(
      <Overridden locale="en" variant="beta">
        Replaced
      </Overridden>
    );

    expect(screen.getByText('Beta')).toBeVisible();
    expect(screen.queryByText('Replaced')).not.toBeInTheDocument();
  });
});
