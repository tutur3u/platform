import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  TutoringReasonBadge,
  TutoringStatusBadge,
  useTutoringLabels,
} from './tutoring-badges';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `translated_${key}`,
}));

describe('useTutoringLabels', () => {
  it('maps reason keys to translated labels', () => {
    function TestComponent() {
      const labels = useTutoringLabels();
      return (
        <div>
          <span data-testid="absent">{labels.reason('ABSENT_RECOVERY')}</span>
          <span data-testid="weak">{labels.reason('WEAK_SUPPORT')}</span>
          <span data-testid="both">{labels.reason('BOTH')}</span>
          <span data-testid="custom">{labels.reason('CUSTOM')}</span>
        </div>
      );
    }

    render(<TestComponent />);
    expect(screen.getByTestId('absent').textContent).toBe(
      'translated_absent_recovery'
    );
    expect(screen.getByTestId('weak').textContent).toBe(
      'translated_weak_support'
    );
    expect(screen.getByTestId('both').textContent).toBe(
      'translated_both_reason'
    );
    expect(screen.getByTestId('custom').textContent).toBe(
      'translated_custom_reason'
    );
  });

  it('maps status keys to translated labels', () => {
    function TestComponent() {
      const labels = useTutoringLabels();
      return (
        <div>
          <span data-testid="done">{labels.status('DONE')}</span>
          <span data-testid="no_show">{labels.status('NO_SHOW')}</span>
          <span data-testid="cancelled">{labels.status('CANCELLED')}</span>
          <span data-testid="pending">{labels.status('PENDING')}</span>
        </div>
      );
    }

    render(<TestComponent />);
    expect(screen.getByTestId('done').textContent).toBe(
      'translated_status_done'
    );
    expect(screen.getByTestId('no_show').textContent).toBe(
      'translated_status_no_show'
    );
    expect(screen.getByTestId('cancelled').textContent).toBe(
      'translated_status_cancelled'
    );
    expect(screen.getByTestId('pending').textContent).toBe(
      'translated_status_pending'
    );
  });
});

describe('TutoringReasonBadge', () => {
  it('renders badge for ABSENT_RECOVERY with styling', () => {
    render(<TutoringReasonBadge reason="ABSENT_RECOVERY" />);
    const badge = screen.getByText('translated_absent_recovery');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('text-dynamic-orange');
  });

  it('renders badge for WEAK_SUPPORT with styling', () => {
    render(<TutoringReasonBadge reason="WEAK_SUPPORT" />);
    const badge = screen.getByText('translated_weak_support');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('text-dynamic-sky');
  });

  it('renders badge for BOTH with styling', () => {
    render(<TutoringReasonBadge reason="BOTH" />);
    const badge = screen.getByText('translated_both_reason');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('text-dynamic-purple');
  });

  it('renders badge for CUSTOM with fallback styling', () => {
    render(<TutoringReasonBadge reason="CUSTOM" />);
    const badge = screen.getByText('translated_custom_reason');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('text-dynamic-gray');
  });
});

describe('TutoringStatusBadge', () => {
  it('renders badge for DONE', () => {
    render(<TutoringStatusBadge status="DONE" />);
    const badge = screen.getByText('translated_status_done');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('text-dynamic-green');
  });

  it('renders badge for NO_SHOW', () => {
    render(<TutoringStatusBadge status="NO_SHOW" />);
    const badge = screen.getByText('translated_status_no_show');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('text-dynamic-red');
  });

  it('renders badge for CANCELLED', () => {
    render(<TutoringStatusBadge status="CANCELLED" />);
    const badge = screen.getByText('translated_status_cancelled');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('text-dynamic-gray');
  });

  it('renders badge for PENDING', () => {
    render(<TutoringStatusBadge status="PENDING" />);
    const badge = screen.getByText('translated_status_pending');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('text-dynamic-orange');
  });
});
