import { withBridgeRequest } from '@tuturuuu/start-bridge/request-context';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mocks, resetCheckoutMocks } from './checkout-test-fixture';
import { POST } from './route';

const api = '/api/v1/inventory/storefronts/shop/checkouts';
const flows = ['cash', 'square_terminal', 'square_pos', 'polar'] as const;
type Flow = (typeof flows)[number];

interface Scenario {
  name: string;
  url: string;
  expected: string;
  origin?: string;
  bridge?: { url: string; base: string };
  publicUrl?: string;
  serverUrl?: string;
}

const scenarios: Scenario[] = [
  {
    name: 'canonical storefront subdomain',
    url: `https://storefront.tuturuuu.com${api}`,
    expected: 'https://storefront.tuturuuu.com',
  },
  {
    name: 'existing development storefront host',
    url: `http://storefront.tuturuuu.localhost${api}`,
    expected: 'http://storefront.tuturuuu.localhost',
  },
  {
    name: 'apex storefront request',
    url: `https://tuturuuu.com/storefront${api}`,
    expected: 'https://tuturuuu.com/storefront',
  },
  {
    name: 'Storefront bridge context after request forwarding',
    url: `https://inventory.tuturuuu.com${api}`,
    bridge: {
      url: `https://tuturuuu.com${api}`,
      base: '/storefront',
    },
    expected: 'https://tuturuuu.com/storefront',
  },
  {
    name: 'Inventory endpoint on the apex',
    url: `https://tuturuuu.com/inventory${api}`,
    bridge: {
      url: `https://tuturuuu.com${api}`,
      base: '/inventory',
    },
    expected: 'https://tuturuuu.com/storefront',
  },
  {
    name: 'mounted shopper origin preserved by the API proxy',
    url: `https://inventory.tuturuuu.com${api}`,
    origin: 'https://tuturuuu.com',
    expected: 'https://tuturuuu.com/storefront',
  },
  {
    name: 'explicit public URL wins over mount and server configuration',
    url: `https://tuturuuu.com/storefront${api}`,
    publicUrl: 'https://public.fixture/custom-storefront/',
    serverUrl: 'https://server.fixture/other',
    expected: 'https://public.fixture/custom-storefront/',
  },
  {
    name: 'explicit server URL wins over the mount',
    url: `https://tuturuuu.com/storefront${api}`,
    serverUrl: 'https://server.fixture/custom-storefront',
    expected: 'https://server.fixture/custom-storefront',
  },
  {
    name: 'an unrelated Origin cannot select a return host',
    url: `http://storefront.tuturuuu.localhost${api}`,
    origin: 'https://tuturuuu.com.attacker.invalid',
    expected: 'http://storefront.tuturuuu.localhost',
  },
  ...[
    'storefront.tuturuuu.com.attacker.invalid',
    'untrusted-storefront.tuturuuu.com',
    'storefront.attacker.invalid',
    'storefront.tuturuuu.localhost.attacker.invalid',
  ].map((host) => ({
    name: `a spoofed Storefront hostname cannot select a return host: ${host}`,
    url: `https://${host}${api}`,
    expected: 'https://storefront.tuturuuu.com',
  })),
];

beforeEach(() => {
  resetCheckoutMocks();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_STOREFRONT_APP_URL', '');
  vi.stubEnv('STOREFRONT_APP_URL', '');
  mocks.createInventoryPolarCheckout.mockResolvedValue({
    checkoutUrl: 'https://checkout.fixture/session',
  });
});
afterEach(() => vi.unstubAllEnvs());

function checkout(flow: Flow, scenario: Scenario) {
  mocks.getPublicStorefront.mockResolvedValue({
    listings: [],
    storefront: {
      analyticsEnabled: true,
      checkoutMode: flow === 'square_pos' ? 'square_terminal' : flow,
      id: 'storefront-1',
      visibility: 'public',
      wsId: 'ws-1',
    },
  });
  if (flow === 'square_pos') {
    mocks.resolveSquareCheckoutMethod.mockResolvedValue({
      checkoutMode: 'square_pos',
      fallbackApplied: true,
      terminalRouting: null,
    });
  }
  if (scenario.publicUrl) {
    vi.stubEnv('NEXT_PUBLIC_STOREFRONT_APP_URL', scenario.publicUrl);
  }
  if (scenario.serverUrl) {
    vi.stubEnv('STOREFRONT_APP_URL', scenario.serverUrl);
  }
  const request = new Request(scenario.url, {
    method: 'POST',
    headers: scenario.origin ? { origin: scenario.origin } : undefined,
    body: JSON.stringify({
      ...(flow === 'cash'
        ? {
            checkoutMethod: 'cash',
            cash: {
              categoryId: '00000000-0000-4000-8000-000000000002',
              walletId: '00000000-0000-4000-8000-000000000003',
            },
          }
        : {}),
      lines: [
        {
          listingId: '00000000-0000-4000-8000-000000000001',
          quantity: 1,
        },
      ],
    }),
  });
  const invoke = () =>
    POST(request, { params: Promise.resolve({ slug: 'shop' }) });
  return scenario.bridge
    ? withBridgeRequest(
        {
          request: new Request(scenario.bridge.url),
          appBase: scenario.bridge.base,
        },
        invoke
      )
    : invoke();
}

describe.each(flows)('%s storefront return URLs', (flow) => {
  it.each(scenarios)('$name', async (scenario) => {
    const response = await checkout(flow, scenario);
    expect(response.status).toBe(201);
    const body = await response.json();
    const order = `${scenario.expected.replace(/\/$/u, '')}/shop/orders/public-token`;
    if (flow === 'polar') {
      expect(mocks.createInventoryPolarCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          storefrontSlug: 'shop',
          storefrontUrl: scenario.expected,
        })
      );
      expect(body.checkoutUrl).toBe('https://checkout.fixture/session');
    } else {
      expect(body.nextUrl).toBe(order);
      expect(body.checkoutUrl).toBe(order);
      if (flow === 'square_pos') {
        expect(mocks.createInventorySquarePosCheckout).toHaveBeenCalledWith(
          expect.objectContaining({ fallbackUrl: order })
        );
      }
    }
  });
});

it('keeps the mounted cash receipt after a completed payment enrichment fails', async () => {
  mocks.getCheckoutByPublicToken
    .mockResolvedValueOnce({ id: 'checkout-1', wsId: 'ws-1' })
    .mockRejectedValueOnce(
      new Error('synthetic post-completion enrichment fault')
    );
  const response = await checkout('cash', {
    name: 'mounted cash enrichment recovery',
    url: `https://tuturuuu.com/inventory${api}`,
    expected: 'https://tuturuuu.com/storefront',
  });
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({
    checkoutMode: 'cash',
    nextUrl: 'https://tuturuuu.com/storefront/shop/orders/public-token',
  });
  expect(mocks.rpc).not.toHaveBeenCalledWith(
    'release_inventory_checkout_session',
    expect.anything()
  );
});
