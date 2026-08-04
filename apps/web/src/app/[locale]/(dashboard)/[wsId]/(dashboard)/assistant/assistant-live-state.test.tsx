import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VoiceErrorState, VoiceLoadingState } from './assistant-live-state';

describe('Mira Live states', () => {
  it('explains the secure session while Live mode is preparing', () => {
    render(
      <VoiceLoadingState
        description="Securing your session"
        privacyNote="Audio uses a short-lived session"
        title="Preparing Live mode"
      />
    );

    expect(screen.getByText('Preparing Live mode')).toBeVisible();
    expect(screen.getByText('Securing your session')).toBeVisible();
    expect(screen.getByText('Audio uses a short-lived session')).toBeVisible();
  });

  it('offers retry and a clear path back to Chat from errors', () => {
    const onRetry = vi.fn();
    const onReturnToChat = vi.fn();
    render(
      <VoiceErrorState
        description="Check your network"
        note="Unused credits are released"
        onRetry={onRetry}
        onReturnToChat={onReturnToChat}
        retryLabel="Try again"
        returnLabel="Return to Chat"
        title="Unable to connect"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Return to Chat' }));

    expect(onRetry).toHaveBeenCalledOnce();
    expect(onReturnToChat).toHaveBeenCalledOnce();
    expect(screen.getByText('Unused credits are released')).toBeVisible();
  });
});
