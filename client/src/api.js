export const API_BASE = '/splitdumb/api/v1';

/** Remove a group from the recent-groups list in localStorage. */
export function removeRecentGroup(code) {
  const saved = JSON.parse(localStorage.getItem('splitdumb_groups') || '[]');
  const filtered = saved.filter(g => g.code !== code);
  localStorage.setItem('splitdumb_groups', JSON.stringify(filtered));
}

export const AUTH_SERVICE = import.meta.env.VITE_AUTH_SERVICE || 'https://auth.johnzhong.win';

/** Clear session-related client state (not recent groups). */
export function clearAuthState() {
  localStorage.removeItem('splitdumb_actors');
  // Keep splitdumb_groups — those are local navigation history, not auth state
}

/** POST to the auth service logout endpoint. */
export function authLogout() {
  return fetch(`${API_BASE}/auth/logout`, { credentials: 'include', method: 'POST' });
}

// Get the selected member for a group from localStorage
export function getSelectedMember(groupCode) {
  const map = JSON.parse(localStorage.getItem('splitdumb_actors') || '{}');
  return map[groupCode] || null; // { id, name }
}

export function setSelectedMember(groupCode, member) {
  const map = JSON.parse(localStorage.getItem('splitdumb_actors') || '{}');
  map[groupCode] = member;
  localStorage.setItem('splitdumb_actors', JSON.stringify(map));
}

export function clearSelectedMember(groupCode) {
  const map = JSON.parse(localStorage.getItem('splitdumb_actors') || '{}');
  delete map[groupCode];
  localStorage.setItem('splitdumb_actors', JSON.stringify(map));
}

async function request(url, options = {}) {
  const { headers: customHeaders, ...rest } = options;
  const headers = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };
  const res = await fetch(`${API_BASE}${url}`, {
    headers,
    credentials: 'include',
    ...rest,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

// Attach X-Member-Id if we have a selected member for this group
async function memberRequest(groupCode, url, options = {}) {
  const actor = getSelectedMember(groupCode);
  const headers = { ...options.headers };
  if (actor && actor.id) headers['X-Member-Id'] = actor.id;
  return request(url, { ...options, headers });
}

export const api = {
  me: () => request('/auth/me'),

  createGroup: (name, passcode) => request('/groups', { method: 'POST', body: JSON.stringify({ name, passcode }) }),
  getGroup: (code) => request(`/groups/${code}`),
  deleteGroup: (code) => request(`/groups/${code}`, { method: 'DELETE' }),
  updateGroup: (code, data) => request(`/groups/${code}`, { method: 'PATCH', body: JSON.stringify(data) }),

  addMember: (code, name) => memberRequest(code, `/groups/${code}/members`, { method: 'POST', body: JSON.stringify({ name }) }),
  editMember: (code, id, data) => memberRequest(code, `/groups/${code}/members/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  removeMember: (code, id, force = false) => memberRequest(code, `/groups/${code}/members/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' }),

  addExpense: (code, data) => memberRequest(code, `/groups/${code}/expenses`, { method: 'POST', body: JSON.stringify(data) }),
  editExpense: (code, id, data) => memberRequest(code, `/groups/${code}/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteExpense: (code, id) => memberRequest(code, `/groups/${code}/expenses/${id}`, { method: 'DELETE' }),

  addSettlement: (code, data) => memberRequest(code, `/groups/${code}/settlements`, { method: 'POST', body: JSON.stringify(data) }),
  confirmSettlement: (code, id, status) => memberRequest(code, `/groups/${code}/settlements/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  getAuditLog: (code, limit) => request(`/groups/${code}/audit?limit=${limit || 50}`),

  adminGroups: () => request('/admin/groups'),

  // Attachment APIs
  getAttachments: (code, expenseId) => request(`/groups/${code}/expenses/${expenseId}/attachments`),
  uploadAttachment: async (code, expenseId, file) => {
    const actor = getSelectedMember(code);
    const headers = {};
    if (actor && actor.id) headers['X-Member-Id'] = actor.id;
    const formData = new FormData();
    formData.append('receipt', file);
    const res = await fetch(`${API_BASE}/groups/${code}/expenses/${expenseId}/attachments`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data;
  },
  deleteAttachment: (id) => request(`/attachments/${id}`, { method: 'DELETE' }),
};