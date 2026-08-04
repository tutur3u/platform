import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VoiceErrorState, VoiceLoadingState } from './assistant-live-state';

describe('Mira Live states', () => {
  it('keeps session startup focused and concise', () => {
    render(
      <VoiceLoadingState
        description="Setting up your microphone and session."
        title="Opening Live"
      />
    );

    expect(screen.getByText('Opening Live')).toBeVisible();
    expect(
      screen.getByText('Setting up your microphone and session.')
    ).toBeVisible();
    expect(screen.queryByText(/short-lived/i)).not.toBeInTheDocument();
  });

  it('offers retry and a clear path back to Chat from errors', () => {
    const onRetry = vi.fn();
    const onReturnToChat = vi.fn();
    render(
      <VoiceErrorState
        description="Check your network"
        onRetry={onRetry}
        onReturnToChat={onReturnToChat}
        retryLabel="Reconnect"
        returnLabel="Chat"
        title="Connection interrupted"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chat' }));

    expect(onRetry).toHaveBeenCalledOnce();
    expect(onReturnToChat).toHaveBeenCalledOnce();
    expect(screen.queryByText(/reserved credits/i)).not.toBeInTheDocument();
  });
});
