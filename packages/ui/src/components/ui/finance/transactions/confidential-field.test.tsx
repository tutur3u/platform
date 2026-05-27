import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfidentialAmount } from './confidential-field';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('ConfidentialAmount', () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: test resets the finance visibility cookie.
    document.cookie =
      'finance-confidential-mode=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
  });

  it('masks visible amounts when finance numbers are globally hidden', () => {
    render(<ConfidentialAmount amount={42} isConfidential={false} />);

    expect(screen.getByText('•••••')).toBeVisible();
    expect(screen.queryByText(/\$42/)).not.toBeInTheDocument();
  });

  it('shows visible amounts when finance numbers are globally shown', () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test sets the finance visibility cookie.
    document.cookie = 'finance-confidential-mode=false;path=/';

    render(<ConfidentialAmount amount={42} isConfidential={false} />);

    expect(screen.queryByText('•••••')).not.toBeInTheDocument();
    expect(screen.getByText(/\$42/)).toBeVisible();
  });
});
