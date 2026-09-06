import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatBox } from './chat-box';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
describe('live text input', () => {
  it('preserves a draft when sending fails without opening the mobile keyboard on mount', async () => {
    const send = vi.fn().mockRejectedValue(new Error('disconnected'));
    render(<ChatBox connected onSubmit={send} />);
    const input = screen.getByRole('textbox', { name: 'message' });
    expect(input).not.toHaveFocus();
    fireEvent.change(input, { target: { value: 'Plan today' } });
    fireEvent.click(screen.getByRole('button', { name: 'send' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('send_failed')
    );
    expect(input).toHaveValue('Plan today');
  });
});
