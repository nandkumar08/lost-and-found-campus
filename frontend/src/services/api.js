/**
 * Tiny fetch wrapper for the FastAPI backend.
 * - attaches the JWT
 * - normalises errors into Error objects with `status` and `field`
 * - supports multipart uploads
 */
const TOKEN_KEY = 'lfc.access_token';
const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  'https://lost-and-found-campus-t7ms.onrender.com'
).replace(/\/+$/, '');

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(message, status, field) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.field = field || null;
  }
}

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) value.forEach((v) => search.append(key, v));
    else search.append(key, value);
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function request(method, path, { body, params, isForm = false, signal } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api${path}${buildQuery(params)}`, {
      method,
      headers,
      body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
      signal
    });
  } catch (networkError) {
    if (networkError.name === 'AbortError') throw networkError;
    throw new ApiError('Cannot reach the server. Check that the API is running.', 0);
  }

  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) throw new ApiError('Unexpected server response', response.status);
    return response;
  }

  const data = await response.json();
  if (!response.ok) {
    const detail = data.detail || 'Request failed';
    throw new ApiError(
      typeof detail === 'string' ? detail : JSON.stringify(detail),
      response.status,
      data.field
    );
  }
  return data;
}

export const api = {
  get: (path, params, options) => request('GET', path, { params, ...options }),
  post: (path, body, options) => request('POST', path, { body, ...options }),
  patch: (path, body, options) => request('PATCH', path, { body, ...options }),
  put: (path, body, options) => request('PUT', path, { body, ...options }),
  del: (path, options) => request('DELETE', path, options),
  upload: (path, formData, method = 'POST') => request(method, path, { body: formData, isForm: true })
};

/* ---------------------------------------------------------------- */
/* Domain helpers                                                     */
/* ---------------------------------------------------------------- */
export const AuthApi = {
  universities: () => api.get('/auth/universities'),
  register: (formData) => api.upload('/auth/register', formData),
  login: (payload) => api.post('/auth/login', payload),
  me: () => api.get('/auth/me'),
  forgot: (payload) => api.post('/auth/forgot-password', payload),
  reset: (payload) => api.post('/auth/reset-password', payload),
  updateProfile: (payload) => api.patch('/users/me', payload),
  changePassword: (payload) => api.post('/users/me/password', payload)
};

export const CatalogApi = {
  categories: (universityCode, params) => api.get('/categories', { university_code: universityCode, ...params }),
  locations: (universityCode, params) => api.get('/locations', { university_code: universityCode, ...params }),
  publicConfig: () => api.get('/config/public')
};

export const ReportApi = {
  browse: (params) => api.get('/reports/public', params),
  detail: (code, universityCode) => api.get(`/reports/public/${code}`, { university_code: universityCode }),
  track: (params) => api.get('/reports/track', params),
  create: (formData) => api.upload('/reports', formData),
  mine: (params) => api.get('/reports/mine', params),
  get: (id) => api.get(`/reports/${id}`),
  status: (id, payload) => api.patch(`/reports/${id}/status`, payload),
  remove: (id) => api.del(`/reports/${id}`),
  timeline: (id) => api.get(`/reports/${id}/timeline`)
};

export const MatchApi = {
  mine: () => api.get('/matches/mine'),
  list: (params) => api.get('/matches', params),
  review: (id, payload) => api.post(`/matches/${id}/review`, payload),
  candidates: (reportId, limit) => api.get(`/matches/candidates/${reportId}`, { limit })
};

export const ClaimApi = {
  submit: (formData) => api.upload('/claims', formData),
  mine: (params) => api.get('/claims/mine', params),
  list: (params) => api.get('/claims', params),
  get: (id) => api.get(`/claims/${id}`),
  review: (id, payload) => api.post(`/claims/${id}/review`, payload),
  evidence: (id, formData) => api.upload(`/claims/${id}/evidence`, formData),
  evidenceFile: (id) => api.get(`/claims/evidence/${id}`),
  cancel: (id) => api.post(`/claims/${id}/cancel`),
  claimable: (reportId) => api.get(`/claims/claimable/${reportId}`)
};

export const ReturnApi = {
  schedule: (payload) => api.post('/returns', payload),
  mine: (params) => api.get('/returns/mine', params),
  list: (params) => api.get('/returns', params),
  confirm: (id, payload) => api.post(`/returns/${id}/confirm`, payload),
  receipt: (id) => api.get(`/returns/${id}/receipt`)
};

export const QrApi = {
  forReport: (reportId) => api.get(`/qr/report/${reportId}`),
  scan: (token) => api.get('/qr/scan', { token }),
  image: (id) => `/api/qr/${id}/image`
};

export const NotificationApi = {
  list: (params) => api.get('/notifications', params),
  read: (id) => api.post(`/notifications/${id}/read`),
  readAll: () => api.post('/notifications/read-all')
};

export const VerificationApi = {
  mine: () => api.get('/verifications/mine'),
  upload: (formData) => api.upload('/verifications/documents', formData),
  applications: (params) => api.get('/verifications/applications', params),
  review: (id, payload) => api.post(`/verifications/applications/${id}/review`, payload)
};

export const AdminApi = {
  dashboard: () => api.get('/admin/dashboard'),
  securityDashboard: () => api.get('/admin/security-dashboard'),
  users: (params) => api.get('/admin/users', params),
  setUserStatus: (id, payload) => api.patch(`/admin/users/${id}/status`, payload),
  setUserRole: (id, payload) => api.patch(`/admin/users/${id}/role`, payload),
  deleteUser: (id) => api.del(`/admin/users/${id}`),
  logs: (params) => api.get('/admin/logs', params),
  settings: () => api.get('/admin/settings'),
  updateSettings: (payload) => api.patch('/admin/settings', payload),
  updateUniversity: (payload) => api.patch('/admin/university', payload),
  uploadLogo: (formData) => api.upload('/admin/university/logo', formData),
  emailLog: (params) => api.get('/admin/email-log', params),
  platformUniversities: () => api.get('/admin/platform/universities'),
  createUniversity: (payload) => api.post('/admin/platform/universities', payload),
  setUniversityStatus: (id, payload) => api.patch(`/admin/platform/universities/${id}/status`, payload),
  platformSettings: () => api.get('/admin/platform/settings'),
  updatePlatformSettings: (payload) => api.patch('/admin/platform/settings', payload),
  platformLogs: (params) => api.get('/admin/platform/logs')
};

export const AnalyticsApi = {
  university: () => api.get('/analytics/university'),
  platform: () => api.get('/analytics/platform')
};

export const CategoryApi = {
  create: (payload) => api.post('/categories', payload),
  update: (id, payload) => api.patch(`/categories/${id}`, payload),
  remove: (id) => api.del(`/categories/${id}`)
};

export const LocationApi = {
  list: (universityCode, params) => api.get('/locations', { university_code: universityCode, ...params }),
  create: (payload) => api.post('/locations', payload),
  update: (id, payload) => api.patch(`/locations/${id}`, payload),
  remove: (id) => api.del(`/locations/${id}`)
};
