import { render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  TutoringReasonBadge,
  TutoringStatusBadge,
  useTutoringLabels,
} from './tutoring-badges';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

describe('tutoring labels', () => {
  const { result } = renderHook(() => useTutoringLabels());

  it.each([
    ['ABSENT_RECOVERY', 'absent_recovery'],
    ['WEAK_SUPPORT', 'weak_support'],
    ['BOTH', 'both_reason'],
    ['CUSTOM', 'custom_reason'],
  ] as const)('labels reason %s as %s', (reason, label) => {
    expect(result.current.reason(reason)).toBe(label);
  });

  it.each([
    ['DONE', 'status_done'],
    ['NO_SHOW', 'status_no_show'],
    ['CANCELLED', 'status_cancelled'],
    ['PENDING', 'status_pending'],
  ] as const)('labels status %s as %s', (status, label) => {
    expect(result.current.status(status)).toBe(label);
  });
});

describe('tutoring badges', () => {
  it.each([
    ['ABSENT_RECOVERY', 'absent_recovery', 'text-dynamic-orange'],
    ['WEAK_SUPPORT', 'weak_support', 'text-dynamic-sky'],
    ['BOTH', 'both_reason', 'text-dynamic-purple'],
    ['CUSTOM', 'custom_reason', 'text-dynamic-gray'],
    ['UNKNOWN' as never, 'custom_reason', 'text-dynamic-gray'],
  ])('renders reason %s with its tone', (reason, label, tone) => {
    render(<TutoringReasonBadge reason={reason} />);
    expect(screen.getByText(label).className).toContain(tone);
  });

  it.each([
    ['DONE', 'status_done', 'text-dynamic-green'],
    ['NO_SHOW', 'status_no_show', 'text-dynamic-red'],
    ['CANCELLED', 'status_cancelled', 'text-dynamic-gray'],
    ['PENDING', 'status_pending', 'text-dynamic-orange'],
    ['UNKNOWN' as never, 'status_pending', 'text-dynamic-orange'],
  ])('renders status %s with its tone', (status, label, tone) => {
    render(<TutoringStatusBadge status={status} />);
    expect(screen.getByText(label).className).toContain(tone);
  });
});
