// In production, API is at /splitdumb/api/v1/
// In dev, Vite proxy handles /splitdumb/api → localhost:3001/api
const API_BASE = '/splitdumb/api/v1';

async function request(url, options = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

export const api = {
  createGroup: (name, passcode) => request('/groups', { method: 'POST', body: JSON.stringify({ name, passcode }) }),
  getGroup: (code) => request(`/groups/${code}`),
  updateGroup: (code, data) => request(`/groups/${code}`, { method: 'PATCH', body: JSON.stringify(data) }),

  addMember: (code, name) => request(`/groups/${code}/members`, { method: 'POST', body: JSON.stringify({ name }) }),
  removeMember: (code, id) => request(`/groups/${code}/members/${id}`, { method: 'DELETE' }),

  addExpense: (code, data) => request(`/groups/${code}/expenses`, { method: 'POST', body: JSON.stringify(data) }),
  editExpense: (code, id, data) => request(`/groups/${code}/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteExpense: (code, id) => request(`/groups/${code}/expenses/${id}`, { method: 'DELETE' }),

  addSettlement: (code, data) => request(`/groups/${code}/settlements`, { method: 'POST', body: JSON.stringify(data) }),
  confirmSettlement: (code, id, status) => request(`/groups/${code}/settlements/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};