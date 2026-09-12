import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MiraArtifactPanel } from './mira-artifact-panel';
import type { WorkspaceArtifact } from './mira-workspace-state';

vi.mock('next-intl', () => ({
  useLocale: () => 'vi',
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({}),
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
  it('keeps finance navigation within the current workspace and language', () => {
    setup('finance');
    expect(screen.getByRole('link', { name: 'open_full' })).toHaveAttribute(
      'href',
      '/vi/workspace-1/finance/wallets'
    );
  });
});
