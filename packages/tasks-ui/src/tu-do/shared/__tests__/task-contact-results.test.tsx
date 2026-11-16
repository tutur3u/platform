import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { WorkspacePeopleSearchResponse } from '@tuturuuu/internal-api/people';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskContactResults } from '../task-contact-results';

const searchPeople = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/internal-api/people', () => ({
  searchWorkspacePeople: searchPeople,
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'vi',
  useTranslations: () => (key: string, values?: { name: string }) =>
    values ? `${key}: ${values.name}` : key,
}));

const contact = {
  kind: 'contact',
  id: 'contact/one',
  linkedUserId: 'member-1',
  displayName: 'Contact One',
  email: 'contact@example.com',
  avatarUrl: null,
} satisfies WorkspacePeopleSearchResponse['data'][number];

describe('Task contact search', () => {
  beforeEach(() => {
    searchPeople.mockReset().mockResolvedValue({ data: [contact] });
  });
  afterEach(cleanup);

  function renderResults(
    props = { workspaceId: 'ws/one', query: 'contact', open: true }
  ) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = (next: typeof props) => (
      <QueryClientProvider client={client}>
        <TaskContactResults {...next} />
      </QueryClientProvider>
    );
    const result = render(view(props));
    return {
      ...result,
      update: (next: typeof props) => result.rerender(view(next)),
    };
  }

  it.each([
    { workspaceId: 'ws-1', query: 'contact', open: false },
    { workspaceId: '', query: 'contact', open: true },
    { workspaceId: 'ws-1', query: ' a ', open: true },
    { workspaceId: 'ws-1', query: 'a'.repeat(101), open: true },
  ])('does not read outside an open bounded workspace search: %j', (props) => {
    renderResults(props);
    expect(searchPeople).not.toHaveBeenCalled();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders only contact links, without promoting a linked or same-id member', async () => {
    searchPeople.mockResolvedValue({
      data: [
        contact,
        { ...contact, kind: 'member', displayName: 'Ineligible Member' },
      ],
    });
    renderResults();
    const link = await screen.findByRole('link', { name: 'open: Contact One' });
    expect(link.getAttribute('href')).toMatch(
      /\/vi\/ws%2Fone\/users\/database\/contact%2Fone$/
    );
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByText('Ineligible Member')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(searchPeople).toHaveBeenCalledWith('ws/one', {
      query: 'contact',
      limit: 10,
    });
  });

  it('shows a safe unavailable state without retrying a denied read', async () => {
    searchPeople.mockRejectedValue(new Error('Forbidden private diagnostic'));
    renderResults();
    expect(await screen.findByRole('status')).toHaveTextContent('unavailable');
    expect(screen.queryByText(/private diagnostic/)).not.toBeInTheDocument();
    expect(searchPeople).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('does not reuse the previous workspace results after a late response', async () => {
    let resolveFirst: (value: WorkspacePeopleSearchResponse) => void = () => {};
    searchPeople.mockImplementation((workspaceId: string) =>
      workspaceId === 'ws/one'
        ? new Promise<WorkspacePeopleSearchResponse>((resolve) => {
            resolveFirst = resolve;
          })
        : Promise.resolve({ data: [] })
    );
    const view = renderResults();
    await waitFor(() => expect(searchPeople).toHaveBeenCalledTimes(1));
    view.update({ workspaceId: 'ws-two', query: 'contact', open: true });
    await waitFor(() => expect(searchPeople).toHaveBeenCalledTimes(2));
    await act(async () => resolveFirst({ data: [contact] }));
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('removes old results immediately while a changed query is debounced or closed', async () => {
    const view = renderResults();
    await screen.findByRole('link');
    searchPeople.mockResolvedValue({ data: [] });
    view.update({ workspaceId: 'ws/one', query: 'different', open: true });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await waitFor(() => expect(searchPeople).toHaveBeenCalledTimes(2));
    view.update({ workspaceId: 'ws/one', query: 'contact', open: false });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(searchPeople).toHaveBeenCalledTimes(2);
  });
});
