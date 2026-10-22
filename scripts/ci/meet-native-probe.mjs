const deniedTargets = Object.freeze([
  'https://untrusted.invalid/nonfixture',
  'http://tuturuuu.com/api/v1/meet-ci-rewrite',
  'http://127.0.0.1/',
  'http://localhost/',
  'http://10.0.0.1/',
  'http://169.254.169.254/',
  'https://tuturuuu.com:444/api/v1/meet-ci-rewrite',
  'https://tuturuuu.com.untrusted.invalid/api/v1/meet-ci-rewrite',
  'https://tuturuuu.com/api/v1/meet-ci-rewrite-lookalike',
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (
      request.method !== 'POST' ||
      url.origin !== 'https://meet-ci-probe.invalid' ||
      request.headers.get('authorization') !== `Bearer ${env.PROBE_TOKEN}`
    )
      return new Response('Forbidden', { status: 403 });
    if (
      url.pathname === '/live-empty' &&
      /^\?name=ci-[a-f0-9-]{36}$/.test(url.search)
    ) {
      const name = url.searchParams.get('name');
      return env.LIVE.get(env.LIVE.idFromName(name)).fetch(
        'https://meet.tuturuuu.com/live-connect'
      );
    }
    if (url.search) return new Response('Forbidden', { status: 403 });
    if (url.pathname === '/provider-invalid')
      return env.PROVIDER.fetch('https://untrusted.invalid/provider');
    if (url.pathname === '/provider-egress-denied')
      return env.PROVIDER.fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-ci:generateContent',
        { method: 'POST', body: '{"contents":[]}' }
      );
    const match = /^\/egress-denied\/(\d)$/.exec(url.pathname);
    if (match && deniedTargets[Number(match[1])])
      return fetch(deniedTargets[Number(match[1])], { redirect: 'manual' });
    return new Response('Forbidden', { status: 403 });
  },
};
