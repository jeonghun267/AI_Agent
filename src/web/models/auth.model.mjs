export function createAuthModel(http) {
  return {
    me: () => http.request('/api/me', {quiet: true}),
    login: (email, password) => http.request('/api/auth/login', {method: 'POST', data: {email, password}, quiet: true}),
    signup: ({email, password, name}) => http.request('/api/auth/signup', {method: 'POST', data: {email, password, name}, quiet: true}),
    logout: () => http.request('/api/auth/logout', {method: 'POST', data: {}}),
  };
}
