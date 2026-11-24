import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { WorkspaceStorageExportLinksResponse } from '@tuturuuu/internal-api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DriveDeniedState,
  DriveEmptyState,
  DriveErrorState,
  DriveFilteringMoreState,
  DriveNoResultsState,
} from './drive-state-views';
import {
  WorkspaceStorageExportLinksButton,
  WorkspaceStorageExportLinksDialog,
} from './export-links-dialog';
import { FilePreviewRenderer } from './file-preview-renderer';

const api = vi.hoisted(() => ({
  exportLinks: vi.fn(),
  revokeLinks: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
      const fullKey = namespace ? `${namespace}.${key}` : key;
      return values ? `${fullKey}:${JSON.stringify(values)}` : fullKey;
    },
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    // biome-ignore lint/performance/noImgElement: test stub for next/image
    <img {...props} alt={String(props.alt ?? '')} />
  ),
}));

vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

vi.mock('@tuturuuu/internal-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tuturuuu/internal-api')>()),
  exportWorkspaceStorageLinks: api.exportLinks,
}));

vi.mock('@tuturuuu/internal-api/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tuturuuu/internal-api/storage')>()),
  revokeWorkspaceStorageExportLinks: api.revokeLinks,
}));

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const exportPayload: WorkspaceStorageExportLinksResponse = {
  folderName: 'Logos',
  folderPath: 'Logos',
  generatedAt: '2026-11-24T00:00:00.000Z',
  indexFile: {
    name: 'index.html',
    relativePath: 'index.html',
    url: 'https://cdn.example.test/index.html',
    size: 512,
    contentType: 'text/html',
  },
  files: [
    {
      name: 'index.html',
      relativePath: 'index.html',
      url: 'https://cdn.example.test/index.html',
      size: 512,
      contentType: 'text/html',
    },
    {
      name: 'logo.svg',
      relativePath: 'assets/logo.svg',
      url: 'https://cdn.example.test/assets/logo.svg',
      size: 1024,
      contentType: 'image/svg+xml',
    },
  ],
  loaderManifest: {
    entryUrl: 'https://cdn.example.test/index.html',
    assetUrls: {
      'index.html': 'https://cdn.example.test/index.html',
      'assets/logo.svg': 'https://cdn.example.test/assets/logo.svg',
    },
  },
  mode: 'rotating',
};

function renderWithQuery(ui: React.ReactElement) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false } },
        })
      }
    >
      {ui}
    </QueryClientProvider>
  );
}

describe('WorkspaceStorageExportLinksDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses a plain header, quiet summary dl, and no gradient or dynamic classes', async () => {
    api.exportLinks.mockResolvedValue(exportPayload);

    renderWithQuery(
      <WorkspaceStorageExportLinksButton
        folderName="Logos"
        folderPath="Logos"
        wsId="ws-1"
      />
    );

    const trigger = screen.getByRole('button', {
      name: 'ws-storage-objects.export.button',
    });
    expect(trigger).toHaveAttribute('data-variant', 'outline');
    expect(trigger.className).not.toMatch(/dynamic-/u);

    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', {
        name: 'ws-storage-objects.export.title',
      })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'ws-storage-objects.export.description:{"folderName":"Logos"}'
      )
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByText('ws-storage-objects.export.rotating_badge')
    ).not.toBeInTheDocument();

    expect(
      await within(dialog).findByText('ws-storage-objects.export.asset_links')
    ).toBeInTheDocument();

    expect(dialog.querySelector('dl')).not.toBeNull();
    expect(dialog.innerHTML).not.toMatch(
      /bg-linear-to-|dynamic-|tracking-\[|text-\[11px\]|h-\[320px\]/u
    );
  });

  it('renders an Alert role when loading export links fails', async () => {
    api.exportLinks.mockRejectedValue(new Error('Export unavailable'));

    renderWithQuery(
      <WorkspaceStorageExportLinksDialog
        folderName="Logos"
        folderPath="Logos"
        onOpenChange={vi.fn()}
        open
        wsId="ws-1"
      />
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-slot', 'alert');
    expect(alert).toHaveAttribute('data-variant', 'destructive');
    expect(alert).toHaveTextContent('Export unavailable');
  });
});

describe('Drive Empty state views', () => {
  it('renders Empty with dashed outline for empty root and folder states', () => {
    const onUpload = vi.fn();
    const onNewFolder = vi.fn();
    const { container, rerender } = render(
      <DriveEmptyState
        canManage
        inFolder={false}
        onNewFolder={onNewFolder}
        onUpload={onUpload}
      />
    );

    const empty = container.querySelector('[data-slot="empty"]');
    expect(empty).toHaveAttribute('role', 'status');
    expect(empty?.className).toContain('border-dashed');
    expect(
      screen.getByText('drive.states.empty_root_title')
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'drive.actions.upload' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'drive.actions.new_folder' })
    );
    expect(onUpload).toHaveBeenCalledTimes(1);
    expect(onNewFolder).toHaveBeenCalledTimes(1);

    rerender(
      <DriveEmptyState
        canManage={false}
        inFolder
        onNewFolder={onNewFolder}
        onUpload={onUpload}
      />
    );
    expect(
      screen.getByText('drive.states.empty_folder_title')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders Empty for no-results, filtering-more, error, and denied states', () => {
    const onClear = vi.fn();
    const onRetry = vi.fn();
    const onGoHome = vi.fn();

    const { rerender } = render(
      <DriveNoResultsState onClear={onClear} query="spec" />
    );
    expect(screen.getByRole('status')).toHaveAttribute('data-slot', 'empty');
    expect(
      screen.getByText('drive.states.no_results_query:{"query":"spec"}')
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'drive.states.clear_filters' })
    );
    expect(onClear).toHaveBeenCalledTimes(1);

    rerender(<DriveFilteringMoreState onClear={onClear} type="pdf" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-slot', 'empty');
    expect(
      screen.getByText(
        'drive.states.filtering_more_title:{"kind":"drive.chips.pdf"}'
      )
    ).toBeInTheDocument();

    rerender(
      <DriveErrorState inFolder onGoHome={onGoHome} onRetry={onRetry} />
    );
    const errorAlert = screen.getByRole('alert');
    expect(errorAlert).toHaveAttribute('data-slot', 'empty');
    fireEvent.click(screen.getByRole('button', { name: 'drive.states.retry' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'drive.states.go_to_files' })
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onGoHome).toHaveBeenCalledTimes(1);

    rerender(<DriveDeniedState />);
    const deniedAlert = screen.getByRole('alert');
    expect(deniedAlert).toHaveAttribute('data-slot', 'empty');
    expect(
      screen.getByRole('heading', { level: 2, name: 'drive.denied.title' })
    ).toBeInTheDocument();
    expect(deniedAlert).toHaveTextContent('drive.denied.title');
    expect(deniedAlert).toHaveTextContent('drive.denied.description');
  });
});

describe('FilePreviewRenderer', () => {
  it('renders Empty with Download action for unsupported previews and avoids raw hues', () => {
    const onDownload = vi.fn();
    const { container, rerender } = render(
      <FilePreviewRenderer
        cleanFileName="archive.bin"
        fileType="other"
        loading={false}
        onDownload={onDownload}
        signedUrl="https://cdn.example.test/archive.bin"
        textContent=""
      />
    );

    const empty = container.querySelector('[data-slot="empty"]');
    expect(empty).not.toBeNull();
    expect(
      screen.getByRole('heading', { level: 3, name: 'archive.bin' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.download' }));
    expect(onDownload).toHaveBeenCalledTimes(1);

    rerender(
      <FilePreviewRenderer
        cleanFileName="photo.png"
        fileType="image"
        loading={false}
        onDownload={onDownload}
        signedUrl="https://cdn.example.test/photo.png"
        textContent=""
      />
    );
    const img = screen.getByRole('img', { name: 'photo.png' });
    expect(img.className).toContain('bg-muted');
    expect(img.className).not.toMatch(/bg-white|bg-black/u);
  });
});
