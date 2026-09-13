import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { MiraTaskArtifact } from './mira-task-artifact';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: () => 'Today' }),
}));
vi.mock('./use-mira-task-completion', () => ({
  useMiraTaskCompletion: () => ({ complete: vi.fn(), pendingIds: new Set() }),
}));
vi.mock('@tuturuuu/tasks-ui/tu-do/shared/task-summary-card', () => ({
  TaskSummaryCard: ({ title }: { title: string }) => <h3>{title}</h3>,
}));
const rows = Array.from({ length: 30 }, (_, index) => ({
  id: String(index),
  title: `Task ${index}`,
  group: 'today',
}));
function Panel() {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <QueryClientProvider client={new QueryClient()}>
      <div ref={ref}>
        <MiraTaskArtifact rows={rows} scrollRootRef={ref} />
      </div>
    </QueryClientProvider>
  );
}
afterEach(() => vi.unstubAllGlobals());
it('keeps manual pagination available without observers', () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  render(<Panel />);
  expect(screen.getAllByRole('heading')).toHaveLength(12);
  fireEvent.click(screen.getByRole('button', { name: 'load_more' }));
  expect(screen.getAllByRole('heading')).toHaveLength(24);
  fireEvent.click(screen.getByRole('button', { name: 'load_more' }));
  expect(screen.getAllByRole('heading')).toHaveLength(30);
  expect(
    screen.queryByRole('button', { name: 'load_more' })
  ).not.toBeInTheDocument();
});
it('rearms near-viewport loading for every page using the panel scroll root', () => {
  const observers: {
    notify: () => void;
    root?: Element | Document | null;
    margin?: string;
  }[] = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      disconnect() {}
      observe() {}
      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit
      ) {
        observers.push({
          root: options?.root,
          margin: options?.rootMargin,
          notify: () =>
            callback(
              [{ isIntersecting: true } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver
            ),
        });
      }
    }
  );
  const { container } = render(<Panel />);
  expect(observers[0]?.root).toBe(container.firstElementChild);
  expect(observers[0]?.margin).toBe('200px 0px');
  act(() => {
    observers[0]?.notify();
    observers[1]?.notify();
  });
  expect(screen.getAllByRole('heading')).toHaveLength(24);
  act(() => {
    observers[2]?.notify();
    observers[3]?.notify();
  });
  expect(screen.getAllByRole('heading')).toHaveLength(30);
});
