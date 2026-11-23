import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageDropdownItem } from './language-dropdown-item';
import { SystemLanguageDropdownItem } from './system-language-dropdown-item';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('../dropdown-menu', () => ({
  DropdownMenuItem: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

const originalLocation = window.location;
const location = { assign: vi.fn(), reload: vi.fn() };

function setUrl(pathname: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...location, pathname, search: '?tab=1', hash: '' },
  });
}

function clearLocaleCookie() {
  document.cookie = 'NEXT_LOCALE=; max-age=0; path=/';
}

beforeEach(() => {
  vi.clearAllMocks();
  clearLocaleCookie();
  setUrl('/personal/meetings');
});

afterEach(() => {
  cleanup();
  clearLocaleCookie();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: originalLocation,
  });
});

describe('SystemLanguageDropdownItem', () => {
  it('is chosen when no locale cookie is stored, whatever the route locale', () => {
    render(<SystemLanguageDropdownItem selected={false} />);
    expect(screen.getByRole('button', { name: 'system' })).toBeDisabled();
  });

  it('clears the stored locale and reloads the unprefixed page', () => {
    document.cookie = 'NEXT_LOCALE=vi; path=/';
    setUrl('/vi/personal/meetings');
    render(<SystemLanguageDropdownItem selected />);

    const item = screen.getByRole('button', { name: 'system' });
    expect(item).toBeEnabled();
    fireEvent.click(item);

    return vi.waitFor(() => {
      expect(document.cookie).not.toContain('NEXT_LOCALE=vi');
      expect(location.assign).toHaveBeenCalledWith('/personal/meetings?tab=1');
    });
  });

  it('reloads in place when the URL carries no locale prefix', () => {
    document.cookie = 'NEXT_LOCALE=en; path=/';
    const onResetLocale = vi.fn(clearLocaleCookie);
    render(<SystemLanguageDropdownItem onResetLocale={onResetLocale} />);

    fireEvent.click(screen.getByRole('button', { name: 'system' }));

    return vi.waitFor(() => {
      expect(onResetLocale).toHaveBeenCalledTimes(1);
      expect(location.reload).toHaveBeenCalledTimes(1);
      expect(location.assign).not.toHaveBeenCalled();
    });
  });
});

describe('LanguageDropdownItem', () => {
  it('marks the stored locale, not the server-provided selection', () => {
    document.cookie = 'NEXT_LOCALE=vi; path=/';
    render(
      <>
        <LanguageDropdownItem label="English" locale="en" selected />
        <LanguageDropdownItem label="Tiếng Việt" locale="vi" />
      </>
    );
    expect(screen.getByRole('button', { name: 'English' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Tiếng Việt' })).toBeDisabled();
  });

  it('stores the chosen locale and reloads the unprefixed page', () => {
    setUrl('/en/personal');
    render(<LanguageDropdownItem label="Tiếng Việt" locale="vi" />);

    fireEvent.click(screen.getByRole('button', { name: 'Tiếng Việt' }));

    return vi.waitFor(() => {
      expect(document.cookie).toContain('NEXT_LOCALE=vi');
      expect(location.assign).toHaveBeenCalledWith('/personal?tab=1');
    });
  });
});
