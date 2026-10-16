export function createAuthModel(http) {
  return {
    me: () => http.request('/api/me', {quiet: true}),
    login: (email, password) => http.request('/api/auth/login', {method: 'POST', data: {email, password}, quiet: true}),
    signup: ({email, password, name}) => http.request('/api/auth/signup', {method: 'POST', data: {email, password, name}, quiet: true}),
    logout: () => http.request('/api/auth/logout', {method: 'POST', data: {}}),
    verifyEmail: token => http.request('/api/auth/verify', {method: 'POST', data: {token}, quiet: true}),
    resendVerification: () => http.request('/api/auth/verify/resend', {method: 'POST', data: {}}),
    forgotPassword: email => http.request('/api/auth/forgot', {method: 'POST', data: {email}, quiet: true}),
    resetPassword: (token, password) => http.request('/api/auth/reset', {method: 'POST', data: {token, password}, quiet: true}),
  };
}
