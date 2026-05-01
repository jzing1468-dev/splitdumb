const API_BASE = '/splitdumb/api/v1';

async function request(url, options = {}) {
  const { headers: customHeaders, ...rest } = options;
  const headers = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };
  const res = await fetch(`${API_BASE}${url}`, {
    headers,
    credentials: 'include', // always send cookies
    ...rest,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

export const api = {
  // Auth — login handled by auth.johnzhong.win
  me: () => request('/auth/me'),
  adminGroups: () => request('/admin/groups'),

  createGroup: (name, passcode) => request('/groups', { method: 'POST', body: JSON.stringify({ name, passcode }) }),
  getGroup: (code) => request(`/groups/${code}`),
  deleteGroup: (code, adminToken) => request(`/groups/${code}`, {
    method: 'DELETE',
    headers: adminToken ? { 'X-Admin-Token': adminToken } : undefined,
  }),
  updateGroup: (code, data) => request(`/groups/${code}`, { method: 'PATCH', body: JSON.stringify(data) }),

  addMember: (code, name) => request(`/groups/${code}/members`, { method: 'POST', body: JSON.stringify({ name }) }),
  removeMember: (code, id, adminToken, force = false) => request(`/groups/${code}/members/${id}${force ? '?force=true' : ''}`, {
    method: 'DELETE',
    headers: adminToken ? { 'X-Admin-Token': adminToken } : undefined,
  }),

  addExpense: (code, data) => request(`/groups/${code}/expenses`, { method: 'POST', body: JSON.stringify(data) }),
  editExpense: (code, id, data) => request(`/groups/${code}/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteExpense: (code, id) => request(`/groups/${code}/expenses/${id}`, { method: 'DELETE' }),

  addSettlement: (code, data) => request(`/groups/${code}/settlements`, { method: 'POST', body: JSON.stringify(data) }),
  confirmSettlement: (code, id, status) => request(`/groups/${code}/settlements/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};