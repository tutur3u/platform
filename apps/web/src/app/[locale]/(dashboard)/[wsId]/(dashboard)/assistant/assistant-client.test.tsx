import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AssistantClient from './assistant-client';

const refreshToken = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/hooks/use-ephemeral-token', () => ({
  classifyLiveInitializationError: () => 'UNKNOWN',
  useEphemeralToken: () => ({
    error: null,
    errorCode: 'UNKNOWN',
    expiresAt: '2099-01-01T00:00:00.000Z',
    isLoading: false,
    liveSessionId: 'live-session-1',
    model: 'gemini-3.1-flash-live-preview',
    refreshToken,
    reservedCredits: 2_000,
    scopeKey: 'personal:user-1',
    token: 'single-use-token',
  }),
}));

vi.mock('@/hooks/use-live-api', () => ({
  LiveAPIProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('./assistant-voice-session', () => ({
  AssistantVoiceSession: ({
    onRestartSession,
  }: {
    onRestartSession: () => Promise<void>;
  }) => (
    <button type="button" onClick={() => void onRestartSession()}>
      Start a new session
    </button>
  ),
}));

describe('AssistantClient', () => {
  beforeEach(() => {
    refreshToken.mockReset();
    refreshToken.mockResolvedValue({ data: { token: 'fresh-token' } });
  });

  it('requests a fresh single-use authorization for a manual reconnect', async () => {
    render(
      <AssistantClient
        creditSource="personal"
        onReturnToChat={vi.fn()}
        wsId="personal"
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Start a new session' })
    );

    await waitFor(() => expect(refreshToken).toHaveBeenCalledOnce());
  });
});
