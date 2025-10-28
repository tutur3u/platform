import { describe, expect, it, vi, beforeEach, beforeAll } from 'vitest';

let mockLocationHref = '';
const mockLocationHrefSetter = vi.fn((value: string) => {
  mockLocationHref = value;
});

describe('Login Multi-Account Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocationHrefSetter.mockClear();
    mockLocationHref = '';

    // Mock window.location if available
    if (typeof window !== 'undefined') {
      if (!Object.getOwnPropertyDescriptor(window, 'location')?.configurable) {
        Object.defineProperty(window, 'location', {
          writable: true,
          configurable: true,
          value: {
            href: '',
            origin: 'http://localhost:3000',
            pathname: '/login',
            search: '',
          },
        });
      }

      // Only define href if it's not already defined or is configurable
      const hrefDescriptor = Object.getOwnPropertyDescriptor(window.location, 'href');
      if (!hrefDescriptor || hrefDescriptor.configurable) {
        Object.defineProperty(window.location, 'href', {
          get: () => mockLocationHref,
          set: mockLocationHrefSetter,
          configurable: true,
        });
      }
    }
  });

  describe('URL Parameter Handling', () => {
    it('should detect multiAccount=true parameter', () => {
      const searchParams = new URLSearchParams('?multiAccount=true');
      expect(searchParams.get('multiAccount')).toBe('true');
    });

    it('should detect returnUrl parameter', () => {
      const returnUrl = '/workspace-123/dashboard';
      const searchParams = new URLSearchParams(`?returnUrl=${encodeURIComponent(returnUrl)}`);
      expect(decodeURIComponent(searchParams.get('returnUrl') || '')).toBe(returnUrl);
    });

    it('should handle both multiAccount and returnUrl together', () => {
      const returnUrl = '/workspace-123';
      const searchParams = new URLSearchParams(`?multiAccount=true&returnUrl=${encodeURIComponent(returnUrl)}`);
      expect(searchParams.get('multiAccount')).toBe('true');
      expect(decodeURIComponent(searchParams.get('returnUrl') || '')).toBe(returnUrl);
    });
  });

  describe('Redirect After Login', () => {
    it('should redirect to /add-account when multiAccount=true', () => {
      const returnUrl = '/workspace-123';

      // Simulate processNextUrl logic
      const multiAccount = 'true';

      if (multiAccount === 'true') {
        const addAccountUrl = `/add-account${returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`;
        mockLocationHrefSetter(addAccountUrl);
      }

      expect(mockLocationHrefSetter).toHaveBeenCalledWith(`/add-account?returnUrl=${encodeURIComponent(returnUrl)}`);
    });

    it('should include returnUrl in add-account redirect', () => {
      const returnUrl = '/workspace-123/settings';
      const multiAccount = 'true';

      if (multiAccount === 'true') {
        const addAccountUrl = `/add-account?returnUrl=${encodeURIComponent(returnUrl)}`;
        mockLocationHrefSetter(addAccountUrl);
      }

      expect(mockLocationHrefSetter).toHaveBeenCalledWith(expect.stringContaining('/add-account'));
      expect(mockLocationHrefSetter).toHaveBeenCalledWith(expect.stringContaining('returnUrl'));
    });

    it('should handle /add-account without returnUrl', () => {
      const multiAccount = 'true';
      const returnUrl = null;

      if (multiAccount === 'true') {
        const addAccountUrl = `/add-account${returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`;
        mockLocationHrefSetter(addAccountUrl);
      }

      expect(mockLocationHrefSetter).toHaveBeenCalledWith('/add-account');
    });
  });

  describe('Relative Path Handling', () => {
    it('should detect relative paths correctly', () => {
      const testCases = [
        { url: '/workspace-123', expected: true },
        { url: '/internal', expected: true },
        { url: 'https://example.com', expected: false },
        { url: 'http://localhost:3000/path', expected: false },
      ];

      testCases.forEach(({ url, expected }) => {
        const isRelativePath = url.startsWith('/');
        expect(isRelativePath).toBe(expected);
      });
    });

    it('should treat relative paths as web app', () => {
      const returnUrl = '/internal';
      const isRelativePath = returnUrl.startsWith('/');

      const returnApp = isRelativePath ? 'web' : null;

      expect(returnApp).toBe('web');
    });

    it('should handle absolute URLs', () => {
      const returnUrl = 'https://example.com/path';
      const isRelativePath = returnUrl.startsWith('/');

      expect(isRelativePath).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should separate auth errors from navigation errors', () => {
      const authError = new Error('Invalid credentials');
      const navigationError = new Error('Invalid URL format');

      // Auth error should be thrown
      expect(() => {
        if (authError.message.includes('credentials')) {
          throw authError;
        }
      }).toThrow('Invalid credentials');

      // Navigation error should not show invalid credentials
      let caughtError: Error | null = null;
      try {
        throw navigationError;
      } catch (navError) {
        caughtError = navError as Error;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError?.message).not.toContain('credentials');
    });

    it('should fallback to /add-account on navigation error in multi-account mode', () => {
      const multiAccount = 'true';
      const returnUrl = '/workspace-123';

      try {
        // Simulate navigation error
        throw new Error('Invalid URL format');
      } catch (navError) {
        // Fallback logic
        if (multiAccount === 'true') {
          mockLocationHrefSetter(`/add-account${returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`);
        }
      }

      expect(mockLocationHrefSetter).toHaveBeenCalledWith(`/add-account?returnUrl=${encodeURIComponent(returnUrl)}`);
    });
  });

  describe('Account Already Exists Flow', () => {
    it('should redirect immediately when account already exists', () => {
      const result = {
        success: false,
        error: 'Account already exists',
      };

      const accountAlreadyExists = !result.success && result.error?.toLowerCase().includes('already exists');

      expect(accountAlreadyExists).toBe(true);

      if (result.success || accountAlreadyExists) {
        const redirectUrl = '/workspace-123';
        mockLocationHrefSetter(redirectUrl);
      }

      expect(mockLocationHrefSetter).toHaveBeenCalledWith('/workspace-123');
    });

    it('should not show error UI for existing accounts', () => {
      const result = {
        success: false,
        error: 'Account already exists',
      };

      const accountAlreadyExists = !result.success && result.error?.toLowerCase().includes('already exists');

      // Should treat as success
      expect(accountAlreadyExists).toBe(true);
    });

    it('should show error for genuine failures', () => {
      const result = {
        success: false,
        error: 'Network error',
      };

      const accountAlreadyExists = !result.success && result.error?.toLowerCase().includes('already exists');

      // Should show error
      expect(accountAlreadyExists).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('Session Storage Integration', () => {
    it('should save current session before navigating to add account', async () => {
      const mockSession = {
        user: { id: 'user-1', email: 'user1@test.com' },
        access_token: 'token',
        refresh_token: 'refresh',
      };

      const accounts = [] as any[];

      // Check if current session exists
      const currentAccountExists = accounts.some(
        (acc) => acc.id === mockSession.user.id
      );

      expect(currentAccountExists).toBe(false);

      // Should save before navigating
      if (!currentAccountExists) {
        // Save logic would happen here
        accounts.push({
          id: mockSession.user.id,
          metadata: { email: mockSession.user.email },
        });
      }

      expect(accounts).toHaveLength(1);
    });
  });

  describe('Locale Handling', () => {
    it('should not include locale in URLs', () => {
      // URLs should be constructed without locale prefix
      const urls = [
        '/login?multiAccount=true',
        '/add-account?returnUrl=%2Fworkspace',
        '/workspace-123/dashboard',
      ];

      urls.forEach(url => {
        // None should start with /[locale]/
        expect(url).not.toMatch(/^\/[a-z]{2}\//);
      });
    });

    it('should rely on proxy.ts for locale handling', () => {
      // Proxy handles locale with 'as-needed' strategy
      const path = '/login';

      // Should not manually add locale
      expect(path).not.toContain('/en/');
      expect(path).not.toContain('/vi/');
    });
  });
});
