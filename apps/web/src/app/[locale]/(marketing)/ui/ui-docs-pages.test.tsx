import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ComponentPage from './components/[componentId]/page';
import ComponentsPage from './components/page';
import OverviewPage from './page';

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('notFound');
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: () => mocks.notFound(),
  permanentRedirect: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations:
    async ({ namespace }: { namespace?: string }) =>
    (key: string, values?: Record<string, string | number>) => {
      if (values?.name) return `${values.name}`;
      if (values?.count) return `${namespace}.${key}.${values.count}`;
      return `${namespace}.${key}`;
    },
}));

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace?: string) =>
    (key: string, values?: Record<string, string | number>) => {
      if (values?.name) return `${values.name}`;
      return `${namespace}.${key}`;
    },
}));

describe('ui docs pages', () => {
  it('renders the overview with setup and component discovery links', async () => {
    render(await OverviewPage({ params: Promise.resolve({ locale: 'en' }) }));

    expect(
      screen.getByRole('link', { name: /overview.setupTitle/i })
    ).toHaveAttribute('href', '/en/ui/setup');
    expect(
      screen.getByRole('link', { name: /overview.componentsTitle/i })
    ).toHaveAttribute('href', '/en/ui/components');
  });

  it('renders all component links on the components index', async () => {
    render(await ComponentsPage({ params: Promise.resolve({ locale: 'en' }) }));

    expect(
      screen.getByRole('heading', { name: /components.title/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Button/ })).toHaveAttribute(
      'href',
      '/en/ui/components/button'
    );
    expect(screen.getByRole('link', { name: /Tooltip/ })).toHaveAttribute(
      'href',
      '/en/ui/components/tooltip'
    );
  });

  it('renders component detail pages with preview, usage, API, and pager links', async () => {
    render(
      await ComponentPage({
        params: Promise.resolve({ componentId: 'button', locale: 'en' }),
      })
    );

    expect(screen.getByRole('heading', { name: 'Button' })).toBeInTheDocument();
    expect(screen.getAllByText('@tuturuuu/ui/button').length).toBeGreaterThan(
      0
    );
    expect(
      screen.getByRole('heading', { name: /detail.usageTitle/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /detail.apiTitle/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Accordion/i })).toHaveAttribute(
      'href',
      '/en/ui/components/accordion'
    );
  });

  it('throws notFound for an unknown component id', async () => {
    await expect(
      ComponentPage({
        params: Promise.resolve({ componentId: 'missing', locale: 'en' }),
      })
    ).rejects.toThrow('notFound');

    expect(mocks.notFound).toHaveBeenCalled();
  });
});
