let describe, it, expect, vi, beforeEach;

// Root script CI runs this file with node --test. Vitest's describe throws
// when it is loaded outside the Vitest runner, so prefer node:test there.
const underNodeTest =
  process.execArgv.includes('--test') ||
  process.argv.includes('--test') ||
  process.env.NODE_TEST_CONTEXT != null;

try {
  if (underNodeTest) throw new Error('use node:test');
  const vitest = await import('vitest');
  describe = vitest.describe;
  it = vitest.it;
  expect = vitest.expect;
  vi = vitest.vi;
  beforeEach = vitest.beforeEach;
} catch {
  const nodeTest = await import('node:test');
  const assert = await import('node:assert/strict');
  describe = nodeTest.describe;
  it = nodeTest.it;
  beforeEach = nodeTest.beforeEach;
  expect = (actual) => ({
    toBe: (expected) => assert.strictEqual(actual, expected),
    toEqual: (expected) => assert.deepStrictEqual(actual, expected),
    toContain: (expected) => assert.ok(actual.includes(expected)),
    toBeTruthy: () => assert.ok(actual),
    toBeFalsy: () => assert.ok(!actual),
    toBeGreaterThan: (expected) => assert.ok(actual > expected),
    toBeGreaterThanOrEqual: (expected) => assert.ok(actual >= expected),
    toBeLessThan: (expected) => assert.ok(actual < expected),
    toThrow: (expectedPattern) => {
      if (typeof actual !== 'function') {
        throw new Error('actual must be a function for toThrow assertion');
      }
      assert.throws(actual, expectedPattern);
    },
    toHaveBeenCalledTimes: (expected) => {
      assert.strictEqual(actual.mock.calls.length, expected);
    },
  });
  vi = {
    fn: (impl) => {
      const calls = [];
      const fn = (...args) => {
        calls.push(args);
        if (fn._implementation) {
          return fn._implementation(...args);
        }
        return fn._returnValue;
      };
      fn._implementation = impl;
      fn._returnValue = undefined;
      fn.mock = { calls };
      fn.mockResolvedValue = (val) => {
        fn._implementation = async () => val;
        return fn;
      };
      fn.mockImplementation = (customImpl) => {
        fn._implementation = customImpl;
        return fn;
      };
      return fn;
    },
  };
}

import {
  DEFAULT_CONFIG_PATH,
  checkEntryRoute,
  checkLoginRoute,
  checkPathsNo5xx,
  fetchWithRedirectTracking,
  loadConfig,
  normalizeBaseUrl,
  parseArgs,
  resolveAppConfig,
  runCutoverSmoke,
} from './cutover-smoke.mjs';

function createMockResponse(status, bodyText = '', headers = {}) {
  const headerMap = new Map();
  for (const [k, v] of Object.entries(headers)) {
    headerMap.set(k.toLowerCase(), v);
  }
  return {
    status,
    statusText:
      status === 200
        ? 'OK'
        : status === 500
          ? 'Internal Server Error'
          : 'Redirect',
    headers: {
      get: (key) => headerMap.get(key.toLowerCase()) || null,
      ...headers,
    },
    text: async () => bodyText,
  };
}

describe('cutover-smoke harness', () => {
  describe('normalizeBaseUrl', () => {
    it('normalizes valid origins', () => {
      expect(normalizeBaseUrl('https://example.com/')).toBe(
        'https://example.com'
      );
      expect(normalizeBaseUrl('http://localhost:3000/some/path')).toBe(
        'http://localhost:3000'
      );
    });

    it('defaults to https when protocol is missing', () => {
      expect(normalizeBaseUrl('staging.tuturuuu.com')).toBe(
        'https://staging.tuturuuu.com'
      );
    });

    it('throws on empty or non-string input', () => {
      expect(() => normalizeBaseUrl('')).toThrow(/Base URL/);
      expect(() => normalizeBaseUrl(null)).toThrow(/Base URL/);
    });

    it('throws on invalid protocols', () => {
      expect(() => normalizeBaseUrl('ftp://example.com')).toThrow(
        /http or https/
      );
    });
  });

  describe('resolveAppConfig and loadConfig', () => {
    it('loads the default configuration file and has expected apps', () => {
      const config = loadConfig(DEFAULT_CONFIG_PATH);
      expect(config).toBeTruthy();
      expect(config.apps).toBeTruthy();
      expect(config.apps.web).toBeTruthy();
      expect(config.apps.marketing).toBeTruthy();
      expect(config.apps.workspace).toBeTruthy();
      expect(config.apps.shortener).toBeTruthy();
    });

    it('resolves configured apps with at least 5 paths', () => {
      const config = loadConfig(DEFAULT_CONFIG_PATH);
      const webConfig = resolveAppConfig('web', config);
      expect(webConfig.name).toBe('web');
      expect(webConfig.entryRoute).toBe('/');
      expect(webConfig.loginRoute).toBe('/login');
      expect(webConfig.paths.length).toBeGreaterThanOrEqual(5);
    });

    it('falls back to _default for unlisted apps', () => {
      const config = loadConfig(DEFAULT_CONFIG_PATH);
      const fallbackConfig = resolveAppConfig('unlisted-service', config);
      expect(fallbackConfig.entryRoute).toBe('/');
      expect(fallbackConfig.loginRoute).toBe('/login');
      expect(fallbackConfig.paths.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('fetchWithRedirectTracking', () => {
    it('returns direct 200 response', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createMockResponse(200, '<html>OK</html>'));

      const res = await fetchWithRedirectTracking(
        'https://example.com/',
        {},
        { fetchImpl: mockFetch }
      );

      expect(res.status).toBe(200);
      expect(res.loopDetected).toBe(false);
      expect(res.chain).toEqual(['https://example.com/']);
      expect(res.body).toContain('<html>OK</html>');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('follows valid redirects cleanly', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url) => {
        if (url === 'https://example.com/') {
          return createMockResponse(301, '', {
            location: 'https://example.com/en',
          });
        }
        if (url === 'https://example.com/en') {
          return createMockResponse(200, '<html>Welcome</html>');
        }
        return createMockResponse(404, 'Not found');
      });

      const res = await fetchWithRedirectTracking(
        'https://example.com/',
        {},
        { fetchImpl: mockFetch }
      );

      expect(res.status).toBe(200);
      expect(res.finalUrl).toBe('https://example.com/en');
      expect(res.chain).toEqual([
        'https://example.com/',
        'https://example.com/en',
      ]);
      expect(res.loopDetected).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('detects circular redirect loops', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url) => {
        if (url === 'https://example.com/a') {
          return createMockResponse(302, '', {
            location: 'https://example.com/b',
          });
        }
        if (url === 'https://example.com/b') {
          return createMockResponse(302, '', {
            location: 'https://example.com/a',
          });
        }
        return createMockResponse(404, '');
      });

      const res = await fetchWithRedirectTracking(
        'https://example.com/a',
        {},
        { fetchImpl: mockFetch }
      );

      expect(res.loopDetected).toBe(true);
      expect(res.status).toBe(0);
      expect(res.error).toContain('Redirect loop detected');
    });

    it('guards against excessive redirects', async () => {
      let count = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        count++;
        return createMockResponse(302, '', {
          location: `https://example.com/step-${count}`,
        });
      });

      const res = await fetchWithRedirectTracking(
        'https://example.com/start',
        {},
        {
          fetchImpl: mockFetch,
          maxRedirects: 3,
        }
      );

      expect(res.maxRedirectsExceeded).toBe(true);
      expect(res.error).toContain('Exceeded maximum redirect limit');
    });
  });

  describe('checkEntryRoute and checkLoginRoute', () => {
    it('checkEntryRoute passes on anonymous 200', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createMockResponse(200, '<html>Entry</html>'));
      const res = await checkEntryRoute('https://example.com', '/', {
        fetchImpl: mockFetch,
      });
      expect(res.passed).toBe(true);
      expect(res.status).toBe(200);
    });

    it('checkEntryRoute fails on non-200', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createMockResponse(502, 'Bad Gateway'));
      const res = await checkEntryRoute('https://example.com', '/', {
        fetchImpl: mockFetch,
      });
      expect(res.passed).toBe(false);
      expect(res.status).toBe(502);
      expect(res.error).toContain('Expected HTTP 200');
    });

    it('checkLoginRoute passes when page renders with 200 and html', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(
          createMockResponse(
            200,
            '<!DOCTYPE html><html><body><form action="/login">Sign in</form></body></html>'
          )
        );
      const res = await checkLoginRoute('https://example.com', '/login', {
        fetchImpl: mockFetch,
      });
      expect(res.passed).toBe(true);
      expect(res.renders).toBe(true);
      expect(res.status).toBe(200);
    });

    it('checkLoginRoute fails if login returns empty body', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createMockResponse(200, '   '));
      const res = await checkLoginRoute('https://example.com', '/login', {
        fetchImpl: mockFetch,
      });
      expect(res.passed).toBe(false);
      expect(res.error).toContain('body was empty');
    });
  });

  describe('checkPathsNo5xx', () => {
    it('passes when none of the 5 paths return 5xx status', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url) => {
        if (url.includes('/robots.txt'))
          return createMockResponse(200, 'User-agent: *');
        if (url.includes('/about')) return createMockResponse(200, 'About us');
        if (url.includes('/pricing'))
          return createMockResponse(200, 'Pricing plans');
        if (url.includes('/login')) return createMockResponse(200, 'Login');
        return createMockResponse(200, 'Home');
      });

      const res = await checkPathsNo5xx(
        'https://example.com',
        ['/', '/login', '/about', '/pricing', '/robots.txt'],
        { fetchImpl: mockFetch }
      );

      expect(res.passed).toBe(true);
      expect(res.testedCount).toBe(5);
      expect(res.paths.every((p) => p.ok)).toBe(true);
    });

    it('fails when any path returns 500', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url) => {
        if (url.includes('/broken'))
          return createMockResponse(500, 'Internal Server Error');
        return createMockResponse(200, 'OK');
      });

      const res = await checkPathsNo5xx(
        'https://example.com',
        ['/', '/login', '/broken', '/pricing', '/robots.txt'],
        { fetchImpl: mockFetch }
      );

      expect(res.passed).toBe(false);
      const failed = res.paths.find((p) => p.path === '/broken');
      expect(failed).toBeTruthy();
      expect(failed.is5xx).toBe(true);
      expect(failed.status).toBe(500);
    });
  });

  describe('runCutoverSmoke end-to-end simulation', () => {
    it('produces PASS report when all smoke requirements succeed', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url) => {
        return createMockResponse(
          200,
          '<html><div class="app">OK</div></html>'
        );
      });

      const report = await runCutoverSmoke(
        'web',
        'https://staging.tuturuuu.com',
        {
          fetchImpl: mockFetch,
        }
      );

      expect(report.status).toBe('PASS');
      expect(report.pass).toBe(true);
      expect(report.app).toBe('web');
      expect(report.baseUrl).toBe('https://staging.tuturuuu.com');
      expect(report.summary.entryRoute.passed).toBe(true);
      expect(report.summary.loginRoute.passed).toBe(true);
      expect(report.summary.noRedirectLoops.passed).toBe(true);
      expect(report.summary.no5xxOn5Paths.passed).toBe(true);
      expect(report.errors.length).toBe(0);
    });

    it('produces FAIL report with structured error details on failure', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url) => {
        if (url.endsWith('/login')) {
          return createMockResponse(500, 'Internal Server Error');
        }
        return createMockResponse(200, '<html>OK</html>');
      });

      const report = await runCutoverSmoke(
        'web',
        'https://staging.tuturuuu.com',
        {
          fetchImpl: mockFetch,
        }
      );

      expect(report.status).toBe('FAIL');
      expect(report.pass).toBe(false);
      expect(report.summary.loginRoute.passed).toBe(false);
      expect(report.errors.length).toBeGreaterThan(0);
      expect(report.errors.some((e) => e.includes('LoginRoute'))).toBe(true);
    });
  });

  describe('parseArgs', () => {
    it('parses positional arguments', () => {
      const parsed = parseArgs(['marketing', 'https://staging.tuturuuu.com']);
      expect(parsed.app).toBe('marketing');
      expect(parsed.baseUrl).toBe('https://staging.tuturuuu.com');
    });

    it('parses flag arguments', () => {
      const parsed = parseArgs([
        '--app',
        'shortener',
        '--url',
        'https://ttr.link',
        '--timeout',
        '5000',
        '--config',
        './custom.json',
      ]);
      expect(parsed.app).toBe('shortener');
      expect(parsed.baseUrl).toBe('https://ttr.link');
      expect(parsed.timeoutMs).toBe(5000);
      expect(parsed.configPath).toBe('./custom.json');
    });

    it('parses help flag', () => {
      const parsed = parseArgs(['--help']);
      expect(parsed.help).toBe(true);
    });
  });
});
