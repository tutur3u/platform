import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CitationContext,
  type CitationContextValue,
  type CitationRepairSession,
} from '../citation-context';
import {
  CitationLibraryDeleteDialog,
  CitationLibraryEdit,
} from '../citation-library-manage';
import { CitationRawRepair } from '../citation-raw-repair';
import { DEFAULT_CITATION_LABELS as labels } from '../labels';
import type {
  CitationLibraryAdapter,
  CitationLibraryItem,
  CitationRepair,
  CitationResult,
} from '../types';

const RAW = 'Tran M. 2021 Synthetic rivers. Synthetic Press.';
const proposal: CitationRepair = {
  work: { id: 'w', type: 'book', title: 'Synthetic Rivers' },
  summary: { title: 'Synthetic Rivers', contributors: 'Tran', year: '2021' },
  uncertainFields: ['publisher'],
  creditsDeducted: 3,
};
const item: CitationLibraryItem = {
  id: 'item-1',
  version: 4,
  work: { id: 'w', type: 'book', title: 'Saved Title' },
  summary: { title: 'Saved Title', contributors: '', year: null },
  updatedAt: '2026-11-16T00:00:00.000Z',
  tags: ['thesis'],
};

function providers(sessions: Map<string, CitationRepairSession>) {
  const client = new QueryClient();
  const value = {
    labels,
    repairSessions: sessions,
    rawRepairInput: { current: null },
  } as unknown as CitationContextValue;
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <CitationContext.Provider value={value}>
        {children}
      </CitationContext.Provider>
    </QueryClientProvider>
  );
}

const library = (
  overrides: Partial<CitationLibraryAdapter>
): CitationLibraryAdapter => ({
  queryKey: ['test-library'],
  list: async () => ({ status: 'ok', data: [] }),
  getMany: async () => ({ status: 'ok', data: { items: [], missingIds: [] } }),
  save: async () => ({ status: 'error', code: 'UNUSED' }),
  ...overrides,
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('raw reference repair before insertion', () => {
  it('confirms once, keeps the proposal across reopen and never auto-inserts', async () => {
    const sessions = new Map<string, CitationRepairSession>();
    const runRaw = vi.fn(async (): Promise<CitationResult<CitationRepair>> => ({
      status: 'ok',
      data: proposal,
    }));
    const onCite = vi.fn();
    const repair = {
      createOperationId: () => 'op-1',
      run: vi.fn(),
      runRaw,
    };
    const view = (
      <CitationRawRepair
        key={RAW}
        input={RAW}
        repair={repair}
        isValid={() => true}
        onCite={onCite}
      />
    );
    const first = render(view, { wrapper: providers(sessions) });

    fireEvent.click(screen.getByRole('button', { name: labels.repairRaw }));
    expect(screen.getByText(labels.repairConfirm)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: labels.repairContinue })
    );
    await screen.findByText('Synthetic Rivers');
    expect(screen.getByText(labels.repairCharged(3))).toBeInTheDocument();
    expect(onCite).not.toHaveBeenCalled();

    first.unmount();
    render(view, { wrapper: providers(sessions) });
    expect(screen.getByText('Synthetic Rivers')).toBeInTheDocument();
    expect(runRaw).toHaveBeenCalledTimes(1);
    expect(runRaw).toHaveBeenCalledWith(RAW, 'op-1');

    fireEvent.click(screen.getByRole('button', { name: labels.useSource }));
    expect(onCite).toHaveBeenCalledWith({
      itemId: null,
      work: proposal.work,
      libraryVersion: null,
    });
    expect(sessions.size).toBe(0);
  });

  it('re-checks the same operation id while settlement is unknown', async () => {
    const sessions = new Map<string, CitationRepairSession>();
    let calls = 0;
    const runRaw = vi.fn(async (): Promise<CitationResult<CitationRepair>> =>
      ++calls === 1
        ? { status: 'error', code: 'BILLING_PENDING', billing: 'unknown' }
        : { status: 'ok', data: proposal }
    );
    const createOperationId = vi
      .fn()
      .mockReturnValueOnce('op-a')
      .mockReturnValue('op-b');
    render(
      <CitationRawRepair
        input={RAW}
        repair={{ createOperationId, run: vi.fn(), runRaw }}
        isValid={() => true}
        onCite={vi.fn()}
      />,
      { wrapper: providers(sessions) }
    );
    fireEvent.click(screen.getByRole('button', { name: labels.repairRaw }));
    fireEvent.click(
      screen.getByRole('button', { name: labels.repairContinue })
    );
    fireEvent.click(
      await screen.findByRole('button', { name: labels.repairCheckAgain })
    );
    await screen.findByText('Synthetic Rivers');
    expect(runRaw.mock.calls).toEqual([
      [RAW, 'op-a'],
      [RAW, 'op-a'],
    ]);
    expect(createOperationId).toHaveBeenCalledTimes(1);
  });
});

describe('saved library management', () => {
  it('sends one delete per explicit confirmation and never retries', async () => {
    const remove = vi.fn(async (): Promise<CitationResult<void>> => ({
      status: 'error',
      code: 'UPSTREAM_ERROR',
    }));
    render(
      <CitationLibraryDeleteDialog
        item={item}
        library={{ ...library({}), remove }}
        labels={labels}
        onOpenChange={vi.fn()}
      />,
      { wrapper: providers(new Map()) }
    );
    fireEvent.click(screen.getByRole('button', { name: labels.deleteSource }));
    await screen.findByText(labels.errorGeneric);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(item);
  });

  it('keeps the draft and the expected version on a conflict', async () => {
    const update = vi.fn(
      async (): Promise<CitationResult<CitationLibraryItem>> => ({
        status: 'error',
        code: 'VERSION_CONFLICT',
      })
    );
    const onDone = vi.fn();
    function FakeEditor({ onSubmit }: { onSubmit: (work: unknown) => void }) {
      const [title, setTitle] = useState('Saved Title');
      return (
        <>
          <input
            aria-label="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <button type="button" onClick={() => onSubmit({ title })}>
            submit
          </button>
        </>
      );
    }
    render(
      <CitationLibraryEdit
        item={item}
        library={{ ...library({}), update }}
        renderManualEditor={(props) => <FakeEditor onSubmit={props.onSubmit} />}
        labels={labels}
        onDone={onDone}
      />,
      { wrapper: providers(new Map()) }
    );
    fireEvent.change(screen.getByLabelText('title'), {
      target: { value: 'Edited Title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    await screen.findByText(labels.libraryConflict);

    expect(update).toHaveBeenCalledWith(item, { title: 'Edited Title' });
    expect(screen.getByLabelText('title')).toHaveValue('Edited Title');
    expect(onDone).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: labels.discardAndReload })
      ).toBeEnabled()
    );
  });
});
