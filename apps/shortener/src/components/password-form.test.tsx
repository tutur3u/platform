import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { leaveFor } from './navigate';
import PasswordForm from './password-form';

vi.mock('./navigate', () => ({ leaveFor: vi.fn() }));

function submit(password: string) {
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

describe('PasswordForm', () => {
  const leave = vi.mocked(leaveFor);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    leave.mockReset();
  });
  function stub(status: number, body: unknown) {
    const fetcher = vi.fn(async () => Response.json(body, { status }));
    vi.stubGlobal('fetch', fetcher);
    return fetcher;
  }

  it('posts to the guarded verify endpoint and leaves for the target', async () => {
    const fetcher = stub(200, {
      url: 'https://dest.example/a?b=1',
      success: true,
    });
    render(<PasswordForm linkId="l2" slug="locked" hint="first pet" />);
    expect(screen.getByText('first pet')).toBeTruthy();
    submit('pw');
    await waitFor(() =>
      expect(leave).toHaveBeenCalledWith('https://dest.example/a?b=1')
    );
    expect(fetcher).toHaveBeenCalledWith('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkId: 'l2', slug: 'locked', password: 'pw' }),
    });
  });

  it('shows the server error without navigating', async () => {
    stub(403, { error: 'Incorrect password. Please try again.' });
    render(<PasswordForm linkId="l2" slug="locked" hint={null} />);
    submit('bad');
    expect(
      await screen.findByText('Incorrect password. Please try again.')
    ).toBeTruthy();
    expect(leave).not.toHaveBeenCalled();
  });
});
