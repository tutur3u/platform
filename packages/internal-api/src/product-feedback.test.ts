import { describe, expect, it, vi } from 'vitest';
import { InternalApiError } from './internal-api-error';
import {
  checkProductFeedbackEligibility,
  getProductFeedback,
  listProductFeedback,
  submitProductFeedback,
} from './product-feedback';

const input = {
  title: 'Synthetic subject',
  body: 'Synthetic details',
  idempotencyKey: '11111111-1111-4111-8111-111111111111',
  turnstileToken: 'synthetic-purpose-token',
};
const receipt = {
  id: '22222222-2222-4222-8222-222222222222',
  createdAt: '2026-10-07T16:00:00Z',
};
describe('shared product feedback contract', () => {
  it('owns authenticated no-store POST and preserves stable key in retries', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json(receipt));
    const options = {
      baseUrl: 'https://feedback.example.test',
      fetch: fetchMock,
      defaultHeaders: { Authorization: 'Bearer synthetic-token' },
    };
    expect(await submitProductFeedback(input, options)).toEqual(receipt);
    await submitProductFeedback(
      { ...input, turnstileToken: 'fresh-token' },
      options
    );
    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url)).toBe(
        'https://feedback.example.test/api/v1/product-feedback'
      );
      expect(init?.method).toBe('POST');
      expect(init?.cache).toBe('no-store');
      expect(new Headers(init?.headers).get('authorization')).toBe(
        'Bearer synthetic-token'
      );
      expect(JSON.parse(init?.body as string).idempotencyKey).toBe(
        input.idempotencyKey
      );
    }
  });
  it('propagates conflict without inventing a receipt', async () => {
    await expect(
      submitProductFeedback(input, {
        baseUrl: 'https://feedback.example.test',
        fetch: vi.fn(async () =>
          Response.json({ error: 'feedback_conflict' }, { status: 409 })
        ),
      })
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('authenticated staff read facade', () => {
  it('uses existing host/Bearer transport, encoded filters and no-store reads', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ items: [], nextCursor: null })
    );
    const options = {
      baseUrl: 'https://feedback.example.test',
      fetch: fetchMock,
      defaultHeaders: { Authorization: 'Bearer synthetic-token' },
    };
    await listProductFeedback(
      {
        view: 'archive',
        status: 'resolved',
        q: '%_\\ private',
        limit: 2,
        cursor: 'opaque',
      },
      options
    );
    await getProductFeedback('synthetic/id', options);
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.pathname).toBe('/api/v1/product-feedback');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      view: 'archive',
      status: 'resolved',
      q: '%_\\ private',
      limit: '2',
      cursor: 'opaque',
    });
    expect(String(fetchMock.mock.calls[1]![0])).toBe(
      'https://feedback.example.test/api/v1/product-feedback/synthetic%2Fid'
    );
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.method).toBe('GET');
      expect(init?.cache).toBe('no-store');
      expect(init?.credentials).toBe('include');
      expect(init?.body).toBeUndefined();
      expect(new Headers(init?.headers).get('authorization')).toBe(
        'Bearer synthetic-token'
      );
    }
  });
  it.each([401, 403, 404, 503])(
    'propagates%s without replacing failure with empty data',
    async (status) => {
      const options = {
        baseUrl: 'https://feedback.example.test',
        fetch: vi.fn(async () =>
          Response.json({ error: { code: 'feedback_unavailable' } }, { status })
        ),
      };
      await expect(listProductFeedback({}, options)).rejects.toMatchObject({
        status,
      });
      await expect(
        getProductFeedback(receipt.id, options)
      ).rejects.toMatchObject({ status });
    }
  );
});

describe('strict product feedback eligibility consumer', () => {
  const baseUrl = 'https://feedback.example.test';
  const unavailable = {
    name: 'InternalApiError',
    message: 'feedback_unavailable',
    status: 503,
    code: 'feedback_unavailable',
  };
  const optionsFor = (fetchMock: typeof fetch) => ({
    baseUrl,
    fetch: fetchMock,
    defaultHeaders: { Authorization: 'Bearer synthetic-token' },
  });

  it('accepts only exact true through the existing host/Bearer GET transport', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ eligible: true })
    );
    expect(
      await checkProductFeedbackEligibility(optionsFor(fetchMock))
    ).toEqual({
      eligible: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${baseUrl}/api/v1/product-feedback/eligibility`);
    expect(new URL(String(url)).search).toBe('');
    expect(init?.method).toBe('GET');
    expect(init?.credentials).toBe('include');
    expect(init?.cache).toBe('no-store');
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer synthetic-token'
    );
  });

  const withInheritedEligible = async (action: () => Promise<void>) => {
    const previous = Object.getOwnPropertyDescriptor(
      Object.prototype,
      'eligible'
    );
    Object.defineProperty(Object.prototype, 'eligible', {
      configurable: true,
      value: true,
    });
    try {
      await action();
    } finally {
      if (previous) {
        Object.defineProperty(Object.prototype, 'eligible', previous);
      } else {
        Reflect.deleteProperty(Object.prototype, 'eligible');
      }
      expect(
        Object.getOwnPropertyDescriptor(Object.prototype, 'eligible')
      ).toEqual(previous);
    }
  };

  it('own-key correction rejects native JSON with only an unrelated own key', async () => {
    await withInheritedEligible(async () => {
      const response = Response.json({ unexpected: 1 });
      const parsed = await response.clone().json();
      expect(Object.keys(parsed)).toEqual(['unexpected']);
      expect(Object.hasOwn(parsed, 'eligible')).toBe(false);
      expect(parsed.eligible).toBe(true);
      const fetchMock = vi.fn<typeof fetch>(async () => response);
      const result = checkProductFeedbackEligibility(optionsFor(fetchMock));
      await expect(result).rejects.toBeInstanceOf(InternalApiError);
      await expect(result).rejects.toMatchObject(unavailable);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it('own-key correction accepts exact own true under the same prerequisite', async () => {
    await withInheritedEligible(async () => {
      const response = Response.json({ eligible: true });
      const parsed = await response.clone().json();
      expect(Object.keys(parsed)).toEqual(['eligible']);
      expect(Object.hasOwn(parsed, 'eligible')).toBe(true);
      const fetchMock = vi.fn<typeof fetch>(async () => response);
      const result = await checkProductFeedbackEligibility(
        optionsFor(fetchMock)
      );
      expect(result).toEqual({ eligible: true });
      expect(Object.keys(result)).toEqual(['eligible']);
      expect(Object.hasOwn(result, 'eligible')).toBe(true);
      expect(result).not.toBe(parsed);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it.each([
    ['false', { eligible: false }],
    ['null', null],
    ['array', [{ eligible: true }]],
    ['string', 'true'],
    ['boolean', true],
    ['number', 1],
    ['missing', {}],
    ['null field', { eligible: null }],
    ['string field', { eligible: 'true' }],
    ['numeric field', { eligible: 1 }],
    ['extra field', { eligible: true, actor: 'synthetic' }],
    ['nested error', { error: { code: 'eligible', eligible: true } }],
    [
      'error with true',
      { eligible: true, error: { code: 'feedback_forbidden' } },
    ],
  ])('rejects malformed successful payload: %s', async (_label, payload) => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json(payload));
    await expect(
      checkProductFeedbackEligibility(optionsFor(fetchMock))
    ).rejects.toMatchObject(unavailable);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['', '{', '{"eligible":true', 'synthetic-private-response'])(
    'safely rejects malformed successful JSON: %s',
    async (body) => {
      const fetchMock = vi.fn<typeof fetch>(async () => new Response(body));
      await expect(
        checkProductFeedbackEligibility(optionsFor(fetchMock))
      ).rejects.toMatchObject(unavailable);
    }
  );

  it.each([201, 202, 206, 299])(
    'rejects unexpected successful status %s even with true payload',
    async (status) => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        Response.json({ eligible: true }, { status })
      );
      await expect(
        checkProductFeedbackEligibility(optionsFor(fetchMock))
      ).rejects.toMatchObject(unavailable);
    }
  );
  it.each([204, 205])('rejects successful empty status %s', async (status) => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(null, { status })
    );
    await expect(
      checkProductFeedbackEligibility(optionsFor(fetchMock))
    ).rejects.toMatchObject(unavailable);
  });

  it.each([401, 403, 404, 503])(
    'preserves actual HTTP %s and standard typed error semantics',
    async (status) => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        Response.json(
          {
            code: 'feedback_forbidden',
            error: { code: 'eligible' },
            eligible: true,
          },
          { status }
        )
      );
      const result = checkProductFeedbackEligibility(optionsFor(fetchMock));
      await expect(result).rejects.toBeInstanceOf(InternalApiError);
      await expect(result).rejects.toMatchObject({
        status,
        code: 'feedback_forbidden',
      });
    }
  );

  it('preserves HTTP denial when its error JSON is malformed', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response('{', { status: 403 })
    );
    await expect(
      checkProductFeedbackEligibility(optionsFor(fetchMock))
    ).rejects.toMatchObject({
      name: 'InternalApiError',
      status: 403,
      message: 'Internal API request failed: 403',
    });
  });

  it('propagates the existing transport dependency rejection without a grant', async () => {
    const failure = new TypeError('synthetic dependency failure');
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw failure;
    });
    await expect(
      checkProductFeedbackEligibility(optionsFor(fetchMock))
    ).rejects.toBe(failure);
  });

  it.each(['false', 'denial', 'unavailable', 'malformed'])(
    'does not cache a positive before a changed second response: %s',
    async (next) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json({ eligible: true }))
        .mockResolvedValueOnce(
          next === 'false'
            ? Response.json({ eligible: false })
            : next === 'malformed'
              ? new Response('{')
              : Response.json(
                  { error: { code: 'eligible' } },
                  {
                    status: next === 'denial' ? 403 : 503,
                  }
                )
        );
      const options = optionsFor(fetchMock);
      expect(await checkProductFeedbackEligibility(options)).toEqual({
        eligible: true,
      });
      await expect(
        checkProductFeedbackEligibility(options)
      ).rejects.toMatchObject({
        status: next === 'denial' ? 403 : 503,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      for (const [url, init] of fetchMock.mock.calls) {
        expect(String(url)).toBe(
          `${baseUrl}/api/v1/product-feedback/eligibility`
        );
        expect(init?.cache).toBe('no-store');
        expect(init?.body).toBeUndefined();
      }
    }
  );
});
