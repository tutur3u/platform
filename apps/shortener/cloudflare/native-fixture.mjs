// In-process Supabase REST and central API fixture for the emitted Worker.
// Every Worker subrequest reaches this fence; anything unadmitted is recorded
// and answered with 599 so the acceptance test fails closed.
export const FIXTURE_ORIGIN = 'https://shortener-fixture.invalid';
const MAX_OPERATIONS = 200;

export function createShortenerFixture({ passwordHash }) {
  const rows = new Map([
    [
      'link-open',
      {
        id: 'link-open',
        slugs: ['abc123', 'My-Alias_1'],
        link: 'https://example.com/landing?utm=a&utm=b',
        password_hash: null,
        password_hint: null,
      },
    ],
    [
      'link-locked',
      {
        id: 'link-locked',
        slugs: ['locked'],
        link: 'https://locked.example/private',
        password_hash: passwordHash,
        password_hint: 'first pet',
      },
    ],
    [
      'link-broken',
      {
        id: 'link-broken',
        slugs: ['broken'],
        link: 'not a url',
        password_hash: null,
        password_hint: null,
      },
    ],
  ]);
  const state = {
    origin: FIXTURE_ORIGIN,
    clicks: [],
    slugReads: [],
    central: [],
    unexpected: [],
  };
  let operations = 0;

  function single(row, columns) {
    if (!row)
      return Response.json(
        { code: 'PGRST116', message: 'JSON object requested, 0 rows' },
        { status: 406 }
      );
    return Response.json(
      Object.fromEntries(columns.map((column) => [column, row[column]]))
    );
  }

  function deny(request) {
    state.unexpected.push({ method: request.method, url: request.url });
    return new Response('Fixture egress denied', { status: 599 });
  }

  state.outboundService = async (request) => {
    if (++operations > MAX_OPERATIONS) return deny(request);
    const url = new URL(request.url);
    if (url.origin !== FIXTURE_ORIGIN || url.username || url.password)
      return deny(request);
    if (
      request.method === 'GET' &&
      url.pathname === '/rest/v1/shortened_links'
    ) {
      const columns = (url.searchParams.get('select') ?? '').split(',');
      const slug = url.searchParams.get('slug');
      const id = url.searchParams.get('id');
      if (slug?.startsWith('eq.')) {
        const value = slug.slice(3);
        state.slugReads.push(value);
        return single(
          [...rows.values()].find((row) => row.slugs.includes(value)),
          columns
        );
      }
      if (id?.startsWith('eq.')) return single(rows.get(id.slice(3)), columns);
      return deny(request);
    }
    if (
      request.method === 'POST' &&
      url.pathname === '/rest/v1/link_analytics'
    ) {
      const body = JSON.parse(await request.text());
      if (!rows.has(body.link_id)) return deny(request);
      state.clicks.push(body);
      return new Response(null, { status: 201 });
    }
    if (url.pathname.startsWith('/api/v1/')) {
      state.central.push({
        method: request.method,
        path: `${url.pathname}${url.search}`,
        body: await request.text(),
        cookie: request.headers.get('cookie'),
      });
      const headers = new Headers({ 'content-type': 'application/json' });
      headers.append('Set-Cookie', 'fixture_a=1; Path=/');
      headers.append('Set-Cookie', 'fixture_b=2; Path=/');
      return new Response('{"message":"tenant denied"}', {
        status: 403,
        headers,
      });
    }
    return deny(request);
  };
  return state;
}
