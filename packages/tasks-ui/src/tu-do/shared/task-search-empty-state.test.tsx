import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  shouldShowTaskSearchEmpty,
  TaskSearchEmptyState,
} from './task-search-empty-state';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
describe('task search empty state', () => {
  it('distinguishes a failed search from no results and keeps recovery available', () => {
    render(<TaskSearchEmptyState query="netflix" failed onClear={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('error_loading_data');
    expect(screen.queryByText('no_results_found')).toBeNull();
    expect(screen.getByRole('button', { name: 'clear_search' })).toBeEnabled();
  });
  it('shows no-results only after a nonblank search finishes without matches', () => {
    const result = {
      query: 'netflix',
      taskCount: 0,
      pending: false,
      failed: false,
    };
    expect(shouldShowTaskSearchEmpty(result)).toBe(true);
    expect(shouldShowTaskSearchEmpty({ ...result, query: ' ' })).toBe(false);
    expect(shouldShowTaskSearchEmpty({ ...result, pending: true })).toBe(false);
    expect(shouldShowTaskSearchEmpty({ ...result, failed: true })).toBe(false);
    expect(shouldShowTaskSearchEmpty({ ...result, taskCount: 1 })).toBe(false);
  });
  it('keeps the searched phrase visible and offers a direct recovery action', () => {
    const clear = vi.fn();
    render(<TaskSearchEmptyState query="netflix" onClear={clear} />);
    expect(screen.getByRole('status')).toHaveTextContent('netflix');
    fireEvent.click(screen.getByRole('button', { name: 'clear_search' }));
    expect(clear).toHaveBeenCalledOnce();
  });
});
