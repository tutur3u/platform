// Route-table GitHub double for the security review classifier and sweep.
// `routes` maps a GET path (without query) to fixed data, to a function of
// the page number, or to a status number (error).
// POSTs answer 201 for check runs and 200 otherwise unless `posts` overrides
// them by path. Every request is recorded.
function routedGitHub(t, routes, { posts = {} } = {}) {
  const requests = [];
  const original = global.fetch;
  t.after(() => {
    global.fetch = original;
  });
  const respond = (status, data = null) => ({
    headers: new Headers(),
    json: async () => data,
    ok: status >= 200 && status < 300,
    status,
  });
  global.fetch = async (url, init = {}) => {
    const full = String(url).replace('https://api.github.com', '');
    const [route, query = ''] = full.split('?');
    const page = Number(new URLSearchParams(query).get('page') ?? 1);
    const body = init.body ? JSON.parse(init.body) : undefined;
    const method = init.method ?? 'GET';
    requests.push({ body, method, route: full });
    if (method !== 'GET') {
      const status =
        posts[route] ?? (route.endsWith('/check-runs') ? 201 : 200);
      return respond(status, {});
    }
    let handler = routes[route];
    if (typeof handler === 'function') handler = handler(page);
    if (handler === undefined) return respond(404);
    if (typeof handler === 'number') return respond(handler);
    return respond(200, handler);
  };
  return requests;
}

module.exports = { routedGitHub };
