import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { LandingEnhancements } from './landing-enhancements';
vi.mock('@tuturuuu/ui/sonner', () => ({
  Toaster: () => <span>Messages</span>,
}));
it('keeps notifications available when navigating away before the landing idle delay', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<LandingEnhancements landing />));
    expect(host.textContent).not.toContain('Messages');
    await act(async () => root.render(<LandingEnhancements landing={false} />));
    expect(host.textContent).toContain('Messages');
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
