import { render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ComponentPage, {
  UiComponentRuntime,
} from './components/[componentId]/page';
import ComponentsPage, { UiComponentsRuntime } from './components/page';
import ContributingPage, { UiContributingRuntime } from './contributing/page';
import OverviewPage, { UiDocsOverviewRuntime } from './page';
import SetupPage, { UiSetupRuntime } from './setup/page';

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

vi.mock('server-only', () => ({}));

// `CodeBlock` is an async server component (shiki highlighting); React's client
// renderer used by Testing Library can't render async children, so stub it with
// a sync equivalent that still exposes the raw code for assertions.
vi.mock('./docs-primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./docs-primitives')>();
  return {
    ...actual,
    CodeBlock: ({ code }: { code: string; label?: string }) => (
      <pre>{code}</pre>
    ),
  };
});

vi.mock('next-intl/server', () => ({
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
    render(
      await UiDocsOverviewRuntime({
        params: Promise.resolve({ locale: 'en' }),
      })
    );

    expect(
      screen.getByRole('link', { name: /overview.setupTitle/i })
    ).toHaveAttribute('href', '/en/ui/setup');
    expect(
      screen.getByRole('link', { name: /overview.componentsTitle/i })
    ).toHaveAttribute('href', '/en/ui/components');
  });

  it('renders all component links on the components index', async () => {
    render(
      await UiComponentsRuntime({
        params: Promise.resolve({ locale: 'en' }),
      })
    );

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
      await UiComponentRuntime({
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
      UiComponentRuntime({
        params: Promise.resolve({ componentId: 'missing', locale: 'en' }),
      })
    ).rejects.toThrow('notFound');

    expect(mocks.notFound).toHaveBeenCalled();
  });

  it.each([
    [
      'overview',
      () => OverviewPage({ params: Promise.resolve({ locale: 'en' }) }),
      UiDocsOverviewRuntime,
    ],
    [
      'components',
      () => ComponentsPage({ params: Promise.resolve({ locale: 'en' }) }),
      UiComponentsRuntime,
    ],
    [
      'component detail',
      () =>
        ComponentPage({
          params: Promise.resolve({ componentId: 'button', locale: 'en' }),
        }),
      UiComponentRuntime,
    ],
    ['setup', () => SetupPage(), UiSetupRuntime],
    ['contributing', () => ContributingPage(), UiContributingRuntime],
  ])('keeps %s runtime data inside Suspense', (_name, renderPage, runtime) => {
    const page = renderPage();

    expect(page).not.toBeInstanceOf(Promise);
    expect(page.type).toBe(Suspense);
    expect(page.props.children.type).toBe(runtime);
  });
});
