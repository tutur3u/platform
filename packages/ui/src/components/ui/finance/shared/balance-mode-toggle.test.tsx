import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FinanceBalanceModeToggle } from './balance-mode-toggle';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const clearBalanceModeCookie = () => {
  document.cookie =
    'finance-balance-mode=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
};

describe('FinanceBalanceModeToggle', () => {
  beforeEach(clearBalanceModeCookie);
  afterEach(() => {
    vi.restoreAllMocks();
    clearBalanceModeCookie();
  });

  it('renders the balance modes as a labelled tablist with ledger active', () => {
    render(<FinanceBalanceModeToggle />);

    const tablist = screen.getByRole('tablist', { name: 'balance_mode' });
    const tabs = within(tablist).getAllByRole('tab');

    expect(tabs.map((tab) => tab.textContent)).toEqual(['ledger', 'audited']);
    // No tab panel exists, so no tab may point at a missing one.
    for (const tab of tabs)
      expect(tab.hasAttribute('aria-controls')).toBe(false);
    expect(screen.getByRole('tab', { name: 'ledger_mode' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: 'audited_mode' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
  });

  it('selects audited on press, persisting and broadcasting the mode', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    render(<FinanceBalanceModeToggle />);

    const audited = screen.getByRole('tab', { name: 'audited_mode' });
    fireEvent.mouseDown(audited);
    fireEvent.click(audited);

    expect(audited).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'ledger_mode' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
    expect(document.cookie).toContain('finance-balance-mode=audited');
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'finance-balance-mode-change' })
    );
  });

  it('moves between modes with the arrow keys', async () => {
    render(<FinanceBalanceModeToggle />);

    const ledger = screen.getByRole('tab', { name: 'ledger_mode' });
    const audited = screen.getByRole('tab', { name: 'audited_mode' });
    ledger.focus();
    fireEvent.keyDown(ledger, { key: 'ArrowRight' });

    await waitFor(() =>
      expect(audited).toHaveAttribute('aria-selected', 'true')
    );
    expect(audited).toHaveFocus();
    expect(document.cookie).toContain('finance-balance-mode=audited');
  });
});
