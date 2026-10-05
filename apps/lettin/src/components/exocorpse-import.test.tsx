// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
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

// Use the installed Playwright label implementation: getByLabel includes
// nested option text from a wrapping label.
function playwrightLabels(element: Element): { normalized: string }[] {
  // apps/web declares playwright; use its package scope under isolated installs.
  const here = createRequire(import.meta.url);
  const require = createRequire(here.resolve('../../../web/package.json'));
  const playwrightRequire = createRequire(require.resolve('playwright'));
  const bundle = readFileSync(
    path.join(
      path.dirname(playwrightRequire.resolve('playwright-core')),
      'lib/coreBundle.js'
    ),
    'utf8'
  );
  const start = bundle.indexOf('function shouldSkipForTextMatching');
  const end = bundle.indexOf(
    '// packages/injected/src/roleSelectorEngine.ts',
    start
  );
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const upstream = bundle.slice(start, end).replaceAll('\\n', '\n');
  return new Function(
    'Node',
    'HTMLInputElement',
    'getAriaLabelledByElements',
    'normalizeWhiteSpace',
    'element',
    `${upstream}\nreturn getElementLabels(new Map(), element);`
  )(
    Node,
    HTMLInputElement,
    () => null,
    (text: string) => text.replace(/\s+/g, ' ').trim(),
    element
  );
}

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
    const oldLabel = source.closest('label')!.cloneNode(true) as Element;
    const oldSource = oldLabel.querySelector('select')!;
    oldSource.removeAttribute('aria-label');
    expect(
      playwrightLabels(oldSource).some((label) => label.normalized === 'Source')
    ).toBe(false);
    expect(
      playwrightLabels(source).some((label) => label.normalized === 'Source')
    ).toBe(true);
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
    expect(
      playwrightLabels(file).some(
        (label) => label.normalized === 'Canonical JSON export'
      )
    ).toBe(true);
    expect(file.type).toBe('file');
    expect(file.disabled).toBe(false);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
