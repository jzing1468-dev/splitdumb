const API_BASE = '/splitdumb/api/v1';

async function request(url, options = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // send cookies
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

export const api = {
  // Auth
  login: (username, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),

  createGroup: (name, passcode) => request('/groups', { method: 'POST', body: JSON.stringify({ name, passcode }) }),
  getGroup: (code) => request(`/groups/${code}`),
  deleteGroup: (code, adminToken) => request(`/groups/${code}`, {
    method: 'DELETE',
    headers: adminToken ? { 'X-Admin-Token': adminToken } : {},
  }),
  updateGroup: (code, data) => request(`/groups/${code}`, { method: 'PATCH', body: JSON.stringify(data) }),

  addMember: (code, name) => request(`/groups/${code}/members`, { method: 'POST', body: JSON.stringify({ name }) }),
  removeMember: (code, id, adminToken, force = false) => request(`/groups/${code}/members/${id}${force ? '?force=true' : ''}`, {
    method: 'DELETE',
    headers: adminToken ? { 'X-Admin-Token': adminToken } : {},
  }),

  addExpense: (code, data) => request(`/groups/${code}/expenses`, { method: 'POST', body: JSON.stringify(data) }),
  editExpense: (code, id, data) => request(`/groups/${code}/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteExpense: (code, id, adminToken) => request(`/groups/${code}/expenses/${id}`, {
    method: 'DELETE',
    headers: adminToken ? { 'X-Admin-Token': adminToken } : {},
  }),

  addSettlement: (code, data) => request(`/groups/${code}/settlements`, { method: 'POST', body: JSON.stringify(data) }),
  confirmSettlement: (code, id, status) => request(`/groups/${code}/settlements/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};