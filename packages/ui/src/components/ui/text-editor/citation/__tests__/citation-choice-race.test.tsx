import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CitationCaptureTab } from '../citation-capture-tab';
import { createDrawerSessionFence } from '../citation-layer';
import type { CitationChoice } from '../citation-source-card';
import { DEFAULT_CITATION_LABELS } from '../labels';
import type {
  CitationAdapter,
  CitationLibraryItem,
  CitationResult,
} from '../types';

const work = (title: string) => ({ id: title, type: 'book', title });
const summary = (title: string) => ({ title, contributors: '', year: null });

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Mirrors CitationLayer: a choice lands only while its session is open. */
function harness() {
  const fence = createDrawerSessionFence();
  const inserted: string[] = [];
  const chooseFor = (session: number) => (choice: CitationChoice) => {
    if (!fence.isActive(session)) return;
    fence.close();
    inserted.push((choice.work as { title: string }).title);
  };
  return { fence, inserted, chooseFor };
}

function setup() {
  const pendingSave = deferred<CitationResult<CitationLibraryItem>>();
  const saved: unknown[] = [];
  const adapter: CitationAdapter = {
    formatDocument: () => ({ inText: {}, bibliography: [], issues: [] }),
    inspectSnapshot: () => ({ status: 'invalid', summary: null }),
    createSnapshot: () => null,
    capture: {
      lookup: async () => ({
        status: 'ok',
        data: {
          kind: 'candidates',
          candidates: [
            { work: work('Source A'), summary: summary('Source A') },
            { work: work('Source B'), summary: summary('Source B') },
          ],
        },
      }),
    },
    library: {
      queryKey: ['test-library'],
      list: async () => ({ status: 'ok', data: [] }),
      getMany: async () => ({
        status: 'ok',
        data: { items: [], missingIds: [] },
      }),
      save: (value) => {
        saved.push(value);
        return pendingSave.promise;
      },
    },
    renderManualEditor: () => null,
  };
  const client = new QueryClient();
  const mount = (onChoose: (choice: CitationChoice) => void) =>
    render(
      <QueryClientProvider client={client}>
        <CitationCaptureTab
          adapter={adapter}
          labels={DEFAULT_CITATION_LABELS}
          isValid={() => true}
          onChoose={onChoose}
        />
      </QueryClientProvider>
    );
  return { adapter, pendingSave, saved, mount };
}

async function findCandidates() {
  fireEvent.change(
    screen.getByLabelText(DEFAULT_CITATION_LABELS.captureInput),
    { target: { value: '10.1234/synthetic' } }
  );
  fireEvent.click(
    screen.getByRole('button', { name: DEFAULT_CITATION_LABELS.captureSubmit })
  );
  await screen.findByText('Source B');
}

const libraryItem = (title: string): CitationLibraryItem => ({
  id: `item-${title}`,
  version: 1,
  work: work(title),
  summary: summary(title),
  updatedAt: '2026-11-16T00:00:00.000Z',
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('drawer session fence', () => {
  it('retires a session on close, choice and reopen', () => {
    const fence = createDrawerSessionFence();
    const first = fence.open();
    expect(fence.isActive(first)).toBe(true);
    const second = fence.open();
    expect(fence.isActive(first)).toBe(false);
    expect(fence.isActive(second)).toBe(true);
    fence.close();
    expect(fence.isActive(second)).toBe(false);
    expect(fence.isActive(0)).toBe(false);
  });
});

describe('save and cite race', () => {
  it('locks competing choices while a save is pending', async () => {
    const { fence, inserted, chooseFor } = harness();
    const { mount, pendingSave } = setup();
    mount(chooseFor(fence.open()));
    await findCandidates();

    fireEvent.click(
      screen.getAllByRole('button', {
        name: DEFAULT_CITATION_LABELS.saveAndUse,
      })[0] as HTMLElement
    );
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', {
          name: DEFAULT_CITATION_LABELS.useSource,
        })[1]
      ).toBeDisabled()
    );
    expect(
      screen.getByRole('button', { name: DEFAULT_CITATION_LABELS.manualEntry })
    ).toBeDisabled();

    pendingSave.resolve({ status: 'ok', data: libraryItem('Source A') });
    await waitFor(() => expect(inserted).toEqual(['Source A']));
  });

  it('keeps a late save in the library but inserts only the final choice', async () => {
    const { fence, inserted, chooseFor } = harness();
    const { mount, pendingSave, saved } = setup();

    const first = mount(chooseFor(fence.open()));
    await findCandidates();
    fireEvent.click(
      screen.getAllByRole('button', {
        name: DEFAULT_CITATION_LABELS.saveAndUse,
      })[0] as HTMLElement
    );
    await waitFor(() => expect(saved).toHaveLength(1));

    // Close the drawer while A is saving, then reopen and cite B.
    fence.close();
    first.unmount();
    mount(chooseFor(fence.open()));
    await findCandidates();
    fireEvent.click(
      screen.getAllByRole('button', {
        name: DEFAULT_CITATION_LABELS.useSource,
      })[1] as HTMLElement
    );
    expect(inserted).toEqual(['Source B']);

    pendingSave.resolve({ status: 'ok', data: libraryItem('Source A') });
    await pendingSave.promise;
    await new Promise((done) => setTimeout(done, 0));
    expect(inserted).toEqual(['Source B']);
    expect(saved).toEqual([work('Source A')]);
  });
});
