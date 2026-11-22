import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConfidentialToggle from './confidential-toggle';

const mocks = vi.hoisted(() => ({
  getSingle: vi.fn(),
  remove: vi.fn(),
  set: vi.fn(),
}));

vi.mock('@tuturuuu/ui/hooks/useSearchParams', () => ({
  default: () => ({
    getSingle: mocks.getSingle,
    remove: mocks.remove,
    set: mocks.set,
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('ConfidentialToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSingle.mockReturnValue(null);
  });

  it('names the switch by the banner title and describes it with visible text', () => {
    render(<ConfidentialToggle hasPermission />);

    const toggle = screen.getByRole('switch', { name: 'confidential-mode' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).toHaveAccessibleDescription('confidential-mode-tooltip');
    expect(screen.getByText('confidential-mode-tooltip')).toBeVisible();
    expect(screen.getByText('include-confidential')).toBeVisible();
  });

  it('excludes confidential amounts when switched off', () => {
    render(<ConfidentialToggle hasPermission />);

    fireEvent.click(screen.getByRole('switch', { name: 'confidential-mode' }));

    expect(mocks.set).toHaveBeenCalledWith(
      { includeConfidential: 'false' },
      false
    );
  });

  it('restores the default when switched back on', () => {
    mocks.getSingle.mockReturnValue('false');
    render(<ConfidentialToggle hasPermission />);

    expect(screen.getByText('exclude-confidential')).toBeVisible();
    fireEvent.click(screen.getByRole('switch', { name: 'confidential-mode' }));

    expect(mocks.remove).toHaveBeenCalledWith('includeConfidential');
  });

  it('renders nothing without permission', () => {
    const { container } = render(<ConfidentialToggle hasPermission={false} />);

    expect(container).toBeEmptyDOMElement();
  });
});
