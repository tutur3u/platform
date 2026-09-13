import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LiveWorkspace } from './live-workspace';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () =>
    Object.assign((key: string) => key, { has: () => true }),
}));

const base = {
  connected: true,
  speaking: false,
  listening: false,
  entries: [],
  activities: [],
  notes: [],
  decide: vi.fn(),
  visualization: <div>Voice visualization</div>,
  status: 'Connected',
  results: 'Workspace result',
  controls: 'Controls',
  children: null,
};
describe('live workspace interactions', () => {
  it('shows compact visualization without duplicate welcome content', () => {
    render(<LiveWorkspace {...base} connected={false} />);
    expect(
      screen.queryByRole('button', { name: 'shortcuts.plan' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Voice visualization')).toBeVisible();
    expect(screen.queryByText('welcome')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'export' })).toBeDisabled();
    expect(screen.getByRole('log', { name: 'transcript' })).toBeVisible();
  });
  it('keeps approval visible when switching between results and notes', () => {
    const decide = vi.fn();
    render(
      <LiveWorkspace
        {...base}
        decide={decide}
        activities={[
          {
            id: 'call-1',
            name: 'create_task',
            args: { name: 'Review design' },
            status: 'approval',
          },
        ]}
        notes={[
          { id: 'note-1', title: 'Decision', content: 'Review on Friday' },
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /notes/ }));
    expect(screen.getByText('Review on Friday')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'approve' }));
    expect(decide).toHaveBeenCalledWith('call-1', true);
    expect(screen.getByRole('button', { name: 'export' })).toBeEnabled();
  });
  it('retains transcripts and export after authorization ends', () => {
    render(
      <LiveWorkspace
        {...base}
        connected={false}
        authorizationExpired
        entries={[
          {
            id: 'turn-1',
            role: 'assistant',
            text: 'Your next step is review.',
            complete: true,
          },
        ]}
      />
    );
    expect(screen.getByText('expired')).toBeVisible();
    expect(screen.getByText('Your next step is review.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'export' })).toBeEnabled();
  });
});

it('shows grounded search results even without function-tool activity', () => {
  render(<LiveWorkspace {...base} hasResults />);
  expect(screen.getByText('Workspace result')).toBeVisible();
});

it('follows the latest captions while retaining full session history', () => {
  render(
    <LiveWorkspace
      {...base}
      entries={Array.from({ length: 5 }, (_, i) => ({
        id: `turn-${i}`,
        role: 'assistant' as const,
        text: `Caption ${i}`,
        complete: true,
      }))}
    />
  );
  const captions = within(screen.getByRole('log'));
  expect(captions.queryByText('Caption 0')).not.toBeInTheDocument();
  expect(captions.getByText('Caption 4')).toBeVisible();
  expect(screen.getByText('Caption 0')).not.toBeVisible();
  fireEvent.click(screen.getByText('transcript', { selector: 'summary' }));
  // The complete history remains available in the disclosure and export.
  expect(screen.getByText('Caption 0')).toBeInTheDocument();
});
