import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UiDocsSidebar } from './ui-docs-sidebar';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/ui/components/button',
}));

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace?: string) =>
    (key: string, values?: Record<string, string | number>) => {
      if (key === 'components' && namespace?.endsWith('.nav')) {
        return 'Components';
      }
      if (key === 'search' && namespace?.endsWith('.nav')) {
        return 'Search components';
      }
      if (key === 'searchPlaceholder') return 'Button, dialog, table...';
      if (key === 'empty') return 'No components found';
      if (key === 'emptyHint')
        return 'Clear the search to browse every component.';
      if (values?.count) return `${key} ${values.count}`;
      return key;
    },
}));

describe('UiDocsSidebar', () => {
  it('renders primary docs links and component links', () => {
    render(<UiDocsSidebar locale="en" />);

    const primaryNav = screen.getByTestId('ui-docs-primary-nav');
    expect(
      within(primaryNav).getByRole('link', { name: /overview/i })
    ).toHaveAttribute('href', '/en/ui');
    expect(
      within(primaryNav).getByRole('link', { name: /Components/i })
    ).toHaveAttribute('href', '/en/ui/components');
    expect(screen.getByRole('link', { name: 'Button' })).toHaveAttribute(
      'href',
      '/en/ui/components/button'
    );
  });

  it('filters component discovery and shows an empty state', () => {
    render(<UiDocsSidebar locale="en" />);

    fireEvent.change(screen.getByLabelText('Search components'), {
      target: { value: 'drawer' },
    });

    expect(screen.getByRole('link', { name: 'Drawer' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Button' })
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search components'), {
      target: { value: 'no-such-component' },
    });

    expect(screen.getByText('No components found')).toBeInTheDocument();
  });
});
