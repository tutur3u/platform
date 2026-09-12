import { fireEvent, render, screen } from '@testing-library/react';
import type { AIModelUI } from '@tuturuuu/types';
import { Command, CommandList } from '@tuturuuu/ui/command';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MiraModelList } from '../mira-model-selector/mira-model-list';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('../mira-model-selector/mira-model-list-item', () => ({
  MiraModelListItem: () => <span>Model</span>,
}));

describe('model picker pagination', () => {
  beforeEach(() =>
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
  );
  afterEach(() => vi.unstubAllGlobals());
  it('keeps more models reachable without a nested scroll container', () => {
    const loadMore = vi.fn();
    const props = {
      defaultModelId: null,
      isEmptyMessage: 'Empty',
      isFavorited: () => false,
      isModelAllowed: () => true,
      model: { value: 'one' } as AIModelUI,
      models: [{ value: 'one' } as AIModelUI],
      onSelectModel: vi.fn(),
      onToggleFavorite: vi.fn(),
      pendingModelId: null,
      onLoadMore: loadMore,
    };
    const view = (hasNextPage: boolean, isFetchingNextPage = false) => (
      <Command>
        <CommandList>
          <MiraModelList
            {...props}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
          />
        </CommandList>
      </Command>
    );
    const { rerender } = render(view(true));
    fireEvent.click(
      screen.getByRole('button', { name: 'model_selector_load_more' })
    );
    expect(loadMore).toHaveBeenCalledTimes(1);
    rerender(view(true, true));
    expect(
      screen.getByRole('button', { name: 'model_selector_load_more' })
    ).toBeDisabled();
    rerender(view(false));
    expect(
      screen.queryByRole('button', { name: 'model_selector_load_more' })
    ).not.toBeInTheDocument();
  });
});
