import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExportDialogContent from './export-dialog-content';

const toastSuccessMock = vi.fn();

function createDeferredResponse(body: unknown) {
  let resolve!: (value: Response) => void;

  const promise = new Promise<Response>((innerResolve) => {
    resolve = innerResolve;
  });

  return {
    promise,
    resolve: () =>
      resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        })
      ),
  };
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

vi.mock('@tuturuuu/ui/dialog', () => ({
  DialogClose: ({ children }: { children: ReactNode }) => children,
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@tuturuuu/ui/xlsx', () => ({
  XLSX: {
    utils: {
      json_to_sheet: vi.fn(() => ({})),
      book_append_sheet: vi.fn(),
      book_new: vi.fn(() => ({})),
    },
    write: vi.fn(() => new ArrayBuffer(8)),
  },
}));

describe('ExportDialogContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn(() => 'blob:test'),
      })
    );
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  it('uses resolved filters for export requests and progress totals', async () => {
    const secondPage = createDeferredResponse({
      data: [
        {
          id: 'user-2',
          full_name: 'Bob',
        },
      ],
      count: 2,
    });

    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'user-1',
                full_name: 'Alice',
              },
            ],
            count: 2,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
      )
      .mockImplementationOnce(() => secondPage.promise);

    render(
      <ExportDialogContent
        wsId="ws-123"
        exportType="users"
        filters={{
          q: '',
          includedGroups: [],
          excludedGroups: ['default-group'],
          status: 'active',
          linkStatus: 'all',
          requireAttention: 'true',
          groupMembership: 'all',
        }}
      />
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'common.export',
      })
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    const firstUrl = new URL(
      vi.mocked(fetch).mock.calls[0]?.[0] as string,
      'http://localhost'
    );
    const secondUrl = new URL(
      vi.mocked(fetch).mock.calls[1]?.[0] as string,
      'http://localhost'
    );

    expect(firstUrl.searchParams.get('page')).toBe('1');
    expect(secondUrl.searchParams.get('page')).toBe('2');
    expect(firstUrl.searchParams.getAll('excludedGroups')).toEqual([
      'default-group',
    ]);
    expect(firstUrl.searchParams.get('requireAttention')).toBe('true');

    await screen.findByText(
      'ws-users.export_progress_value:{"processed":1,"total":2}'
    );

    secondPage.resolve();

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith('common.export-success');
    });
  });
});
