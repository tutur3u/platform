export const PUBLIC_MARKETING_ALIAS_CASES = [
  {
    expectedLocation: 'http://localhost/pricing',
    url: 'http://localhost/en/pricing',
  },
  {
    expectedLocation: 'http://localhost/?hash-nav=1#pricing',
    url: 'http://localhost/pricing',
  },
  {
    expectedLocation: 'http://localhost/meet-together',
    url: 'http://localhost/en/products/meet-together',
  },
  {
    expectedLocation: 'http://localhost/meet-together',
    url: 'http://localhost/products/meet-together',
  },
  {
    expectedLocation: 'http://localhost/meet-together/plans/summer',
    url: 'http://localhost/en/calendar/meet-together/plans/summer',
  },
  {
    expectedLocation: 'https://docs.tuturuuu.com/',
    url: 'http://localhost/en/docs',
  },
  {
    expectedLocation:
      'https://tools.tuturuuu.localhost/qr?utm_source=e2e&tag=a&tag=b',
    url: 'http://localhost/en/qr-generator?utm_source=e2e&tag=a&tag=b',
  },
  {
    expectedLocation:
      'https://tools.tuturuuu.localhost/random?utm_source=e2e&tag=a&tag=b',
    url: 'http://localhost/en/tools/random?utm_source=e2e&tag=a&tag=b',
  },
  {
    expectedLocation:
      'https://tools.tuturuuu.localhost/qr?utm_source=e2e&tag=a&tag=b',
    url: 'http://localhost/qr-generator?utm_source=e2e&tag=a&tag=b',
  },
  {
    expectedLocation:
      'https://tools.tuturuuu.localhost/random?utm_source=e2e&tag=a&tag=b',
    url: 'http://localhost/tools/random?utm_source=e2e&tag=a&tag=b',
  },
  {
    expectedLocation: 'http://localhost/meet-together',
    url: 'http://localhost/calendar/meet-together',
  },
  {
    expectedLocation: 'http://localhost/meet-together',
    url: 'http://localhost/calendar/meet-together/',
  },
  {
    expectedLocation: 'http://localhost/meet-together/plans/summer',
    url: 'http://localhost/calendar/meet-together/plans/summer',
  },
];
