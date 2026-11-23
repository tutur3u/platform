import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
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

function setBrowserLanguages(languages: string[]) {
  Object.defineProperty(window.navigator, 'languages', {
    configurable: true,
    get: () => languages,
  });
}

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
  setBrowserLanguages(['en-US', 'en']);
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

  it('clears the stored locale and loads the page in the browser language', () => {
    document.cookie = 'NEXT_LOCALE=en; path=/';
    setBrowserLanguages(['vi-VN', 'en']);
    // An unprefixed public page renders English only, so the browser
    // language must be carried in the path.
    setUrl('/about');
    render(<SystemLanguageDropdownItem selected={false} />);

    const item = screen.getByRole('button', { name: 'system' });
    expect(item).toBeEnabled();
    fireEvent.click(item);

    return vi.waitFor(() => {
      expect(document.cookie).not.toContain('NEXT_LOCALE=en');
      expect(location.assign).toHaveBeenCalledWith('/vi/about?tab=1');
    });
  });

  it('runs the host reset before loading under the browser language', () => {
    document.cookie = 'NEXT_LOCALE=vi; path=/';
    setUrl('/vi/personal/meetings');
    const onResetLocale = vi.fn(clearLocaleCookie);
    render(<SystemLanguageDropdownItem onResetLocale={onResetLocale} />);

    fireEvent.click(screen.getByRole('button', { name: 'system' }));

    return vi.waitFor(() => {
      expect(onResetLocale).toHaveBeenCalledTimes(1);
      expect(location.assign).toHaveBeenCalledWith(
        '/en/personal/meetings?tab=1'
      );
    });
  });

  it('uses the server-provided selection when rendered on the server', () => {
    document.cookie = 'NEXT_LOCALE=vi; path=/';
    expect(renderToString(<SystemLanguageDropdownItem selected />)).toContain(
      'disabled'
    );
    expect(
      renderToString(<SystemLanguageDropdownItem selected={false} />)
    ).not.toContain('disabled');
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

  it('stores the chosen locale and loads the page under its prefix', () => {
    // Regression: an unprefixed English-only public page must not undo a
    // Vietnamese choice (and rewrite the cookie) on the next document load.
    setUrl('/about');
    render(<LanguageDropdownItem label="Tiếng Việt" locale="vi" />);

    fireEvent.click(screen.getByRole('button', { name: 'Tiếng Việt' }));

    return vi.waitFor(() => {
      expect(document.cookie).toContain('NEXT_LOCALE=vi');
      expect(location.assign).toHaveBeenCalledWith('/vi/about?tab=1');
    });
  });

  it('swaps an existing locale prefix', () => {
    setUrl('/vi/personal');
    render(<LanguageDropdownItem label="English" locale="en" />);

    fireEvent.click(screen.getByRole('button', { name: 'English' }));

    return vi.waitFor(() => {
      expect(location.assign).toHaveBeenCalledWith('/en/personal?tab=1');
    });
  });

  it('uses the server-provided selection when rendered on the server', () => {
    document.cookie = 'NEXT_LOCALE=vi; path=/';
    expect(
      renderToString(
        <LanguageDropdownItem label="English" locale="en" selected />
      )
    ).toContain('disabled');
  });
});
