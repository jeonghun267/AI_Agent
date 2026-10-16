// Models are thin, stateless API wrappers: one function per endpoint.
export function createConfigModel(http) {
  return {
    load: () => http.request('/api/config', {quiet: true}),
  };
}
