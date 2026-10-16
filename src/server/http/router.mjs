// Minimal method + path router. ":name" segments match an id-like value.
// Route options: { auth: false } for public endpoints (default is signed-in only).
export function createRouter() {
  const routes = [];

  function add(method, pattern, handler, options = {}) {
    const keys = [];
    const source = pattern.replace(/:(\w+)/g, (_, key) => { keys.push(key); return '([a-zA-Z0-9-]+)'; });
    routes.push({method, regex: new RegExp(`^${source}$`), keys, handler, options: {auth: true, ...options}});
  }

  function match(method, path) {
    let pathMatched = false;
    for (const route of routes) {
      const found = path.match(route.regex);
      if (!found) continue;
      pathMatched = true;
      if (route.method !== method) continue;
      const params = Object.fromEntries(route.keys.map((key, index) => [key, found[index + 1]]));
      return {route, params};
    }
    return {route: null, pathMatched};
  }

  return {
    get: (pattern, handler, options) => add('GET', pattern, handler, options),
    post: (pattern, handler, options) => add('POST', pattern, handler, options),
    patch: (pattern, handler, options) => add('PATCH', pattern, handler, options),
    delete: (pattern, handler, options) => add('DELETE', pattern, handler, options),
    match,
  };
}
