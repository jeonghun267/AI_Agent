const path = id => `/api/claims/${encodeURIComponent(id)}`;

export function createClaimModel(http) {
  return {
    list: ({deleted = false} = {}) => http.request(`/api/claims${deleted ? '?deleted=1' : ''}`).then(r => r.claims),
    get: (id, {deleted = false} = {}) => http.request(`${path(id)}${deleted ? '?deleted=1' : ''}`).then(r => r.claim),
    create: (input, key) => http.request('/api/claims', {method: 'POST', data: input, key}).then(r => r.claim),
    update: (id, version, input) => http.request(path(id), {method: 'PATCH', data: input, version}).then(r => r.claim),
    moveToTrash: (id, version, reason) => http.request(path(id), {method: 'DELETE', data: {reason}, version}).then(r => r.claim),
    restore: (id, version) => http.request(`${path(id)}/restore`, {method: 'POST', data: {}, version}).then(r => r.claim),
    transition: (id, version, action, reason) => http.request(`${path(id)}/transition`, {method: 'POST', data: {action, reason}, version}).then(r => r.claim),

    uploadFile: (id, version, file, key) => http.request(`${path(id)}/files`, {
      method: 'POST', raw: file, version, key,
      headers: {'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name)},
    }),
    removeFile: (id, version, fileId) => http.request(`${path(id)}/files/${encodeURIComponent(fileId)}`, {method: 'DELETE', version}).then(r => r.claim),
    downloadFile: fileId => http.request(`/api/files/${encodeURIComponent(fileId)}`),

    draftTemplate: id => http.request(`${path(id)}/draft-template`),
    saveDraft: (id, version, draft, key) => http.request(`${path(id)}/drafts`, {method: 'POST', data: draft, version, key}).then(r => r.claim),
    submitDraft: (id, version, submission, key) => http.request(`${path(id)}/drafts/submit`, {method: 'POST', data: submission, version, key}).then(r => r.claim),
    recordReply: (id, version, reply) => http.request(`${path(id)}/replies`, {method: 'POST', data: reply, version}).then(r => r.claim),
    recordReceipt: (id, version, receipt, key) => http.request(`${path(id)}/receipts`, {method: 'POST', data: receipt, version, key}),
  };
}
