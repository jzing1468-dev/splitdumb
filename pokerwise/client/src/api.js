export const API_BASE = '/pokerwise/api/v1';

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

export const api = {
  // Sessions
  createSession: (data) => request('/sessions', { method: 'POST', body: JSON.stringify(data) }),
  listSessions: () => request('/sessions'),
  getSession: (id) => request(`/sessions/${id}`),
  deleteSession: (id, adminToken) => request(`/sessions/${id}`, {
    method: 'DELETE',
    headers: adminToken ? { 'X-Admin-Token': adminToken } : {},
  }),
  settleSession: (id) => request(`/sessions/${id}/settle`, { method: 'POST' }),
  getSettlements: (id) => request(`/sessions/${id}/settlements`),

  // Players
  addPlayer: (sessionId, name) => request(`/sessions/${sessionId}/players`, {
    method: 'POST', body: JSON.stringify({ name })
  }),
  editPlayer: (sessionId, pid, data) => request(`/sessions/${sessionId}/players/${pid}`, {
    method: 'PATCH', body: JSON.stringify(data)
  }),
  removePlayer: (sessionId, pid) => request(`/sessions/${sessionId}/players/${pid}`, {
    method: 'DELETE'
  }),

  // Actions
  buyin: (sessionId, pid, amount) => request(`/sessions/${sessionId}/players/${pid}/buyin`, {
    method: 'POST', body: JSON.stringify({ amount })
  }),
  cashout: (sessionId, pid, amount) => request(`/sessions/${sessionId}/players/${pid}/cashout`, {
    method: 'POST', body: JSON.stringify({ amount })
  }),
  editCashout: (sessionId, pid, amount) => request(`/sessions/${sessionId}/players/${pid}/cashout`, {
    method: 'PATCH', body: JSON.stringify({ amount })
  }),
  editBuyin: (sessionId, pid, totalBuyIn) => request(`/sessions/${sessionId}/players/${pid}/buyin`, {
    method: 'PATCH', body: JSON.stringify({ total_buy_in: totalBuyIn })
  }),
};