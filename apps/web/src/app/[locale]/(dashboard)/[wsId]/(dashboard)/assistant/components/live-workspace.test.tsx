import { fireEvent, render, screen } from '@testing-library/react';
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
  onPrompt: vi.fn(),
  status: 'Connected',
  results: 'Workspace result',
  controls: 'Controls',
  children: null,
};
describe('live workspace interactions', () => {
  it('disables prompts while disconnected and keeps the transcript labelled', () => {
    render(<LiveWorkspace {...base} connected={false} />);
    expect(
      screen.getByRole('button', { name: 'shortcuts.plan' })
    ).toBeDisabled();
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
