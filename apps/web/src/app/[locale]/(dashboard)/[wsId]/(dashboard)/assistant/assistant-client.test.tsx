// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AssistantClient from './assistant-client';

const refreshToken = vi.fn();
const tokenState = vi.hoisted(() => ({ blocked: null as unknown }));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/hooks/use-ephemeral-token', () => ({
  classifyLiveInitializationError: () => 'UNKNOWN',
  useEphemeralToken: () => ({
    blocked: tokenState.blocked,
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

vi.mock('./live-eligibility/live-blocked-dialog', () => ({
  LiveBlockedDialog: ({
    billingWsId,
    eligibility,
    onOpenChange,
  }: {
    billingWsId: string;
    eligibility: { reason: string };
    onOpenChange: (open: boolean) => void;
  }) => (
    <div role="dialog" data-billing={billingWsId}>
      {eligibility.reason}
      <button type="button" onClick={() => onOpenChange(false)}>
        Not now
      </button>
    </div>
  ),
}));

vi.mock('./live-interaction-status', () => ({
  LiveInteractionStatus: () => null,
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

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe('AssistantClient', () => {
  beforeEach(() => {
    tokenState.blocked = null;
    refreshToken.mockReset();
    refreshToken.mockResolvedValue({ data: { token: 'fresh-token' } });
  });

  it('requests a fresh single-use authorization for a manual reconnect', async () => {
    render(
      <AssistantClient
        creditSource="personal"
        onReturnToChat={vi.fn()}
        wsId="personal"
      />,
      { wrapper }
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Start a new session' })
    );

    await waitFor(() => expect(refreshToken).toHaveBeenCalledOnce());
  });

  it('maps a blocked token response to the blocked dialog', () => {
    tokenState.blocked = {
      eligible: false,
      reason: 'credits_exhausted',
      tier: 'PLUS',
      billing: { name: 'Acme', personal: false },
      params: { plans: [], balance: 10, minimumCredits: 500 },
    };
    const onReturnToChat = vi.fn();
    render(
      <AssistantClient
        creditSource="workspace"
        creditWsId="ws-1"
        onReturnToChat={onReturnToChat}
        wsId="ws-1"
      />,
      { wrapper }
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('credits_exhausted');
    expect(dialog).toHaveAttribute('data-billing', 'ws-1');
    expect(
      screen.queryByRole('button', { name: 'Start a new session' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onReturnToChat).toHaveBeenCalledOnce();
  });
});
