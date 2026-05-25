import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TagFilter } from './tag-filter';

const mocks = vi.hoisted(() => ({
  listTransactionTags: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/finance', () => ({
  listTransactionTags: (
    ...args: Parameters<typeof mocks.listTransactionTags>
  ) => mocks.listTransactionTags(...args),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function renderTagFilter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TagFilter wsId="ws-1" selectedTagIds={[]} onTagsChange={vi.fn()} />
    </QueryClientProvider>
  );
}

describe('tag filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listTransactionTags.mockResolvedValue([]);
  });

  it('loads transaction tags through the internal API helper', async () => {
    renderTagFilter();

    await waitFor(() => {
      expect(mocks.listTransactionTags).toHaveBeenCalledWith('ws-1');
    });
  });
});
