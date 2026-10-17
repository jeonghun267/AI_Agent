const claimPath = id => `/api/claims/${encodeURIComponent(id)}/ai`;

// Every call returns a preview; nothing is saved until the user saves it.
// Pass an AbortSignal to let the user cancel (the server may still finish the call).
export function createAiModel(http) {
  return {
    draft: (claimId, {signal} = {}) => http.request(`${claimPath(claimId)}/draft`, {method: 'POST', data: {}, signal}),
    translateIssue: (text, {signal} = {}) => http.request('/api/ai/translate-issue', {method: 'POST', data: {text}, signal}),
    analyzeReply: (claimId, body, {signal} = {}) => http.request(`${claimPath(claimId)}/analyze-reply`, {method: 'POST', data: {body}, signal}),
    extract: (claimId, fileId, {signal} = {}) => http.request(`${claimPath(claimId)}/extract`, {method: 'POST', data: {fileId}, signal}),
    // Reads a document the user picked before the claim exists. Nothing is stored.
    extractDocument: (file, {signal} = {}) => http.request('/api/ai/extract', {
      method: 'POST', raw: file, signal,
      headers: {'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name)},
    }),
  };
}
