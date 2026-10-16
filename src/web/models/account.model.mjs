export function createAccountModel(http) {
  return {
    setAiConsent: consent => http.request('/api/account/ai-consent', {method: 'POST', data: {consent}}).then(r => r.user),
    exportData: () => http.request('/api/account/export'),
    deleteAccount: password => http.request('/api/account/delete', {method: 'POST', data: {password}}),
  };
}
