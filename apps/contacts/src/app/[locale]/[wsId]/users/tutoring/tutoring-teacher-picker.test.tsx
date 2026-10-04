import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TutoringTeacherPicker } from './tutoring-teacher-picker';

const state = vi.hoisted(() => ({
  config: null as any,
  props: null as any,
  next: vi.fn(),
  request: vi.fn(),
  pages: [
    {
      data: [
        {
          id: 'other-class-teacher',
          full_name: 'Center Teacher',
          display_name: null,
        },
      ],
      page: 1,
      totalPages: 2,
    },
  ],
}));
vi.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: (config: unknown) => {
    state.config = config;
    return {
      data: { pages: state.pages },
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage: state.next,
    };
  },
}));
vi.mock('@tuturuuu/internal-api/tutoring', () => ({
  listTutoringTeachers: state.request,
}));
vi.mock('@tuturuuu/ui/hooks/use-debounce', () => ({
  useDebounce: (value: string) => [value],
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/custom/combobox', () => ({
  Combobox: (props: any) => {
    state.props = props;
    return (
      <>
        <button type="button" onClick={() => props.onSearchChange('Center')}>
          Search
        </button>
        <button
          type="button"
          onClick={() => props.onChange('other-class-teacher')}
        >
          Choose
        </button>
        <button type="button" onClick={props.onLoadMore}>
          More
        </button>
        <span>
          {props.options.map((option: any) => option.label).join(', ')}
        </span>
      </>
    );
  },
}));

describe('center teacher picker', () => {
  beforeEach(() => vi.clearAllMocks());
  it('uses the eligible teacher catalog, paginates, and clears search after selection', () => {
    const change = vi.fn();
    render(
      <TutoringTeacherPicker
        knownOptions={[{ value: 'homeroom', label: 'Homeroom Teacher' }]}
        onChange={change}
        value=""
        wsId="center"
      />
    );
    expect(screen.getByText('Center Teacher')).toBeInTheDocument();
    expect(screen.queryByText('Homeroom Teacher')).not.toBeInTheDocument();
    void state.config.queryFn({ pageParam: 2 });
    expect(state.request).toHaveBeenCalledWith('center', {
      page: 2,
      pageSize: 20,
      q: undefined,
    });
    expect(state.config.getNextPageParam({ page: 1, totalPages: 2 })).toBe(2);
    expect(
      state.config.getNextPageParam({ page: 2, totalPages: 2 })
    ).toBeUndefined();
    fireEvent.click(screen.getByText('More'));
    expect(state.next).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText('Search'));
    expect(state.config.queryKey).toEqual([
      'tutoring-teachers',
      'center',
      'Center',
    ]);
    fireEvent.click(screen.getByText('Choose'));
    expect(change).toHaveBeenCalledWith('other-class-teacher');
    expect(state.config.queryKey).toEqual(['tutoring-teachers', 'center', '']);
  });
});
