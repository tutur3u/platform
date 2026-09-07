import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPwaInstallPrompt,
  initializePwaInstall,
} from '../../hooks/pwa-install-prompt';
import { PwaStatus } from './pwa-status';

const labels = {
  offline_status: 'offline_status',
  install: 'install',
  install_help: 'install_help',
  cache_help: 'cache_help',
};
beforeEach(() => {
  initializePwaInstall();
  clearPwaInstallPrompt();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('PWA status and installation', () => {
  it('shows offline limitations without offering an unavailable install', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<PwaStatus labels={labels} />);
    expect(screen.getByRole('status')).toHaveTextContent('offline_status');
    expect(screen.queryByRole('button', { name: 'install' })).toBeNull();
  });
  it('provides Home Screen instructions when a browser has no install prompt', () => {
    render(<PwaStatus labels={labels} />);
    fireEvent.click(screen.getByRole('button', { name: 'install' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('install_help');
  });
  it('only invokes the native install prompt after an explicit click', async () => {
    const prompt = vi.fn(async () => {});
    const event = Object.assign(
      new Event('beforeinstallprompt', { cancelable: true }),
      { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) }
    );
    act(() => {
      window.dispatchEvent(event);
    });
    render(<PwaStatus labels={labels} />);
    expect(prompt).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'install' }));
    });
    expect(prompt).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'install' })).toBeNull();
  });
});
