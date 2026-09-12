import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MiraArtifactPanel } from './mira-artifact-panel';
import type { WorkspaceArtifact } from './mira-workspace-state';

vi.mock('next-intl', () => ({
  useLocale: () => 'vi',
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({
    number: (value: number) => String(value),
    dateTime: (value: Date) => value.toISOString(),
  }),
}));
vi.mock('@/lib/meet-app-url', () => ({
  getMeetAppOrigin: () => 'https://meet.tuturuuu.com',
}));
vi.mock('./mira-meeting-create', () => ({ MiraMeetingCreate: () => null }));

function setup(kind: WorkspaceArtifact['kind']) {
  const client = new QueryClient();
  client.setQueryData(['mira-artifact', 'workspace-1', kind], []);
  render(
    <QueryClientProvider client={client}>
      <MiraArtifactPanel artifact={{ kind, wsId: 'workspace-1' }} />
    </QueryClientProvider>
  );
}
describe('Mira artifact navigation', () => {
  it('opens meetings at the satellite route in the current language', () => {
    setup('meetings');
    expect(screen.getByRole('link', { name: 'open_full' })).toHaveAttribute(
      'href',
      'https://meet.tuturuuu.com/vi/workspace-1/meetings'
    );
  });
  it('explains when a tailored currency filter has no matching wallets', () => {
    const client = new QueryClient();
    client.setQueryData(
      ['mira-artifact', 'workspace-1', 'finance'],
      [{ id: 'wallet', title: 'Cash', amount: 50, currency: 'VND' }]
    );
    render(
      <QueryClientProvider client={client}>
        <MiraArtifactPanel
          artifact={{
            kind: 'finance',
            wsId: 'workspace-1',
            presentation: {
              title: 'Travel budget',
              currency: 'USD',
              description: 'Review the travel balance.',
            },
          }}
        />
      </QueryClientProvider>
    );
    expect(
      screen.getByRole('heading', { name: 'Travel budget' })
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Review the travel balance.')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('finance_description')).not.toBeInTheDocument();
    expect(screen.getByText('no_matching_items')).toBeInTheDocument();
    expect(screen.queryByText('Cash')).not.toBeInTheDocument();
  });
  it('keeps finance navigation within the current workspace and language', () => {
    setup('finance');
    for (const link of screen.getAllByRole('link', { name: 'open_full' })) {
      expect(link).toHaveAttribute('href', '/vi/workspace-1/finance/wallets');
    }
  });
});

it('preserves user search for title updates but applies an assistant search change', () => {
  const client = new QueryClient();
  client.setQueryData(['mira-artifact', 'workspace-1', 'finance'], []);
  const panel = (title: string, search?: string) => (
    <QueryClientProvider client={client}>
      <MiraArtifactPanel
        artifact={{
          kind: 'finance',
          wsId: 'workspace-1',
          presentation: { title, search },
        }}
      />
    </QueryClientProvider>
  );
  const { rerender } = render(panel('Balances'));
  const input = screen.getByRole('textbox', { name: 'search_items' });
  fireEvent.change(input, { target: { value: 'Travel' } });
  rerender(panel('Your balances'));
  expect(input).toHaveValue('Travel');
  rerender(panel('Cash balances', 'Cash'));
  expect(input).toHaveValue('Cash');
});
