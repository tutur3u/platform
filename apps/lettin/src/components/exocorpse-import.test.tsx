// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ExocorpseImport } from './exocorpse-import';

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ isPending: false, reset: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  InternalApiError: class extends Error {},
}));
vi.mock('@tuturuuu/internal-api/lettin', () => ({
  applyLettinExocorpseImport: vi.fn(),
  previewLettinExocorpseImport: vi.fn(),
}));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    (
      ({
        importSource: 'Source',
        canonicalExport: 'Canonical JSON export',
        exocorpseCms: 'Exocorpse CMS',
      }) as Record<string, string>
    )[key] ?? key,
}));
vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}));
vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({
    variant: _variant,
    ...props
  }: ComponentProps<'button'> & { variant?: string }) => {
    void _variant;
    return <button {...props} />;
  },
}));
vi.mock('@tuturuuu/ui/dialog', () => {
  const Container = ({ children }: ComponentProps<'div'>) => (
    <div>{children}</div>
  );
  return Object.fromEntries(
    [
      'Dialog',
      'DialogContent',
      'DialogDescription',
      'DialogHeader',
      'DialogTitle',
      'DialogTrigger',
    ].map((name) => [name, Container])
  );
});

it('finds the source by its exact label and exposes the canonical file input', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<ExocorpseImport wsId="synthetic-workspace" />)
    );
    const source = container.querySelector('select');
    expect(source).not.toBeNull();
    if (!source) throw new Error('Import source select is missing');
    expect(source.getAttribute('aria-label')).toBe('Source');
    const sourceLabel = source.labels?.[0];
    expect(sourceLabel).toBe(source.closest('label'));
    expect(sourceLabel?.textContent).toContain('Source');
    expect(source.value).toBe('cms');
    expect(container.querySelector('input[type="file"]')).toBeNull();
    await act(async () => {
      source.value = 'file';
      source.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelector('select')).toBe(source);
    const file =
      container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(file).not.toBeNull();
    if (!file) throw new Error('Canonical file input is missing');
    expect(file.labels).toHaveLength(1);
    expect(file.labels?.[0]?.textContent?.trim()).toBe('Canonical JSON export');
    expect(file.type).toBe('file');
    expect(file.disabled).toBe(false);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
