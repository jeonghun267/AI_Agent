// Routes live in location.hash so links, refresh and the back button work
// without server-side routing.
//   #/                     dashboard
//   #/trash, #/settings
//   #/claims/:id[/:tab]
//   #/login, #/signup, #/forgot
//   #/verify/:token, #/reset/:token   one-time links from account emails
const LINK_ROUTES = ['verify', 'reset'];

export function parseHash(hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'claims' && parts[1]) return {name: 'claim', id: parts[1], tab: parts[2] || 'overview'};
  if (LINK_ROUTES.includes(parts[0]) && parts[1]) return {name: parts[0], token: parts[1]};
  if (['trash', 'settings', 'login', 'signup', 'forgot'].includes(parts[0])) return {name: parts[0]};
  return {name: 'dashboard'};
}

export function routeHash(route) {
  if (route.name === 'claim') return `#/claims/${encodeURIComponent(route.id)}${route.tab && route.tab !== 'overview' ? `/${route.tab}` : ''}`;
  if (LINK_ROUTES.includes(route.name)) return `#/${route.name}/${encodeURIComponent(route.token)}`;
  if (route.name === 'dashboard') return '#/';
  return `#/${route.name}`;
}

// True for a URL that carries a one-time token, which should not stay in history.
export const isLinkHash = hash => LINK_ROUTES.some(name => hash.startsWith(`#/${name}/`));
