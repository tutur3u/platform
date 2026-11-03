// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transcribe: vi.fn(),
  loadRecording: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const messages = (await import('../../../../../../messages/en.json'))
    .default as Record<string, unknown>;
  const lookup = (path: string) =>
    path
      .split('.')
      .reduce<unknown>(
        (node, key) => (node as Record<string, unknown> | undefined)?.[key],
        messages
      );
  return {
    useTranslations: (namespace: string) => (key: string) =>
      String(lookup(`${namespace}.${key}`) ?? `${namespace}.${key}`),
  };
});
vi.mock('@tuturuuu/icons', () => ({
  EyeIcon: () => null,
  FileText: () => null,
  Headphones: () => null,
}));
vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({ children, onClick, disabled }: ComponentProps<'button'>) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));
vi.mock('@/hooks/useTranscription', () => ({
  useTranscription: () => ({
    isTranscribing: false,
    transcribe: mocks.transcribe,
  }),
}));
vi.mock('@/hooks/useRecordingLoader', () => ({
  useRecordingLoader: () => ({
    audioRecording: null,
    isLoadingChunks: false,
    loadError: null,
    loadRecording: mocks.loadRecording,
  }),
}));
vi.mock('./components/AudioPlayer', () => ({
  AudioPlayer: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="audio-player" /> : null,
}));
vi.mock('./components/DeleteConfirmation', () => ({
  DeleteConfirmation: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="delete-confirmation" /> : null,
}));
vi.mock('./components/TranscriptViewer', () => ({
  TranscriptViewer: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="transcript-viewer" /> : null,
}));

import { RecordingSessionActions } from './recording-session-actions';

const baseSession = {
  id: 'session',
  status: 'pending_transcription' as const,
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:05:00.000Z',
  can_manage: true,
  transcript: null,
};

function show(session = baseSession) {
  render(
    <RecordingSessionActions
      wsId="workspace"
      meetingId="meeting"
      session={session}
    />
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.loadRecording.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('legacy recording actions after the recorder lock', () => {
  it('offers no Transcribe action and points to Meet AI', () => {
    show();
    expect(screen.queryByRole('button', { name: /Transcrib/ })).toBeNull();
    expect(screen.getByText(/Use Meet AI/)).toBeTruthy();
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it('keeps an existing recording playable and deletable', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(mocks.loadRecording).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByTestId('delete-confirmation')).toBeTruthy();
  });

  it('keeps an existing transcript readable', () => {
    show({
      ...baseSession,
      transcript: { session_id: 'session', text: 'Hello' },
    } as unknown as typeof baseSession);
    fireEvent.click(screen.getByRole('button', { name: 'View Transcript' }));
    expect(screen.getByTestId('transcript-viewer')).toBeTruthy();
  });
});
