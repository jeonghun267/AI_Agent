// Routes live in location.hash so links, refresh and the back button work
// without server-side routing.
//   #/                     dashboard
//   #/trash, #/settings
//   #/claims/:id[/:tab]
//   #/login, #/signup
export function parseHash(hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'claims' && parts[1]) return {name: 'claim', id: parts[1], tab: parts[2] || 'overview'};
  if (['trash', 'settings', 'login', 'signup'].includes(parts[0])) return {name: parts[0]};
  return {name: 'dashboard'};
}

export function routeHash(route) {
  if (route.name === 'claim') return `#/claims/${encodeURIComponent(route.id)}${route.tab && route.tab !== 'overview' ? `/${route.tab}` : ''}`;
  if (route.name === 'dashboard') return '#/';
  return `#/${route.name}`;
}
