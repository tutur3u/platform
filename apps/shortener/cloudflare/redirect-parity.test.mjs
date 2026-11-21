import assert from 'node:assert/strict';
import test from 'node:test';
import { compare, probe } from './redirect-parity.mjs';

function fakeFetch(answers) {
  const seen = [];
  const fetcher = async (url, init) => {
    seen.push({ url, init });
    const answer = answers[url] ?? { status: 200 };
    return new Response(null, {
      status: answer.status,
      headers: answer.location ? { location: answer.location } : {},
    });
  };
  return { fetcher, seen };
}

test('probes without following redirects and encodes each segment', async () => {
  const { fetcher, seen } = fakeFetch({
    'https://a.example/meet/Ab%20c': { status: 307, location: 'https://x' },
  });
  assert.deepEqual(await probe('https://a.example/', 'meet/Ab c', fetcher), {
    status: 307,
    location: 'https://x',
  });
  assert.equal(seen[0].init.redirect, 'manual');
  assert.equal(seen[0].init.headers.cookie, undefined);
});

test('flags status or Location differences', async () => {
  const { fetcher } = fakeFetch({
    'https://old.example/abc': { status: 307, location: 'https://dest/' },
    'https://new.example/abc': { status: 307, location: 'https://dest/' },
    'https://old.example/gone': { status: 200 },
    'https://new.example/gone': { status: 404 },
  });
  const rows = await compare({
    baseline: 'https://old.example',
    candidate: 'https://new.example',
    slugs: ['abc', 'gone'],
    fetcher,
  });
  assert.deepEqual(
    rows.map((row) => [row.slug, row.ok]),
    [
      ['abc', true],
      ['gone', false],
    ]
  );
});
