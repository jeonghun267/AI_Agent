const claimPath = id => `/api/claims/${encodeURIComponent(id)}/ai`;

// Every call returns a preview; nothing is saved until the user saves it.
export function createAiModel(http) {
  return {
    draft: claimId => http.request(`${claimPath(claimId)}/draft`, {method: 'POST', data: {}}),
    translateIssue: text => http.request('/api/ai/translate-issue', {method: 'POST', data: {text}}),
    analyzeReply: (claimId, body) => http.request(`${claimPath(claimId)}/analyze-reply`, {method: 'POST', data: {body}}),
    extract: (claimId, fileId) => http.request(`${claimPath(claimId)}/extract`, {method: 'POST', data: {fileId}}),
  };
}
