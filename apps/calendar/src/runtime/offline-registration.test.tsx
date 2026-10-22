import { render, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('./offline-worker?worker&url', () => ({ default: '/serwist/sw.js' }));

import { CalendarOfflineProvider } from './offline-registration';

it('registers one root-scoped worker at the existing URL across remounts', async () => {
  const register = vi.fn(async () => ({}));
  const removeEventListener = vi.fn();
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      register,
      addEventListener: vi.fn(),
      removeEventListener,
      controller: null,
    },
  });
  const first = render(
    <CalendarOfflineProvider>
      <div>Calendar</div>
    </CalendarOfflineProvider>
  );
  await waitFor(() =>
    expect(register).toHaveBeenCalledWith('/serwist/sw.js', { scope: '/' })
  );
  first.unmount();
  const second = render(
    <CalendarOfflineProvider>
      <div>Calendar</div>
    </CalendarOfflineProvider>
  );
  await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
  second.unmount();
});
