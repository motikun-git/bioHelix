export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/**
 * Small fetch wrapper. The login cookie is httpOnly, so the browser sends it
 * automatically; we never touch tokens in JavaScript.
 */
export async function api(path, { method = 'GET', body, form } = {}) {
  const options = { method, credentials: 'same-origin', headers: {} };
  if (form) options.body = form;
  else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${path}`, options);
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your internet connection.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) {
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    throw new ApiError(res.status, data?.message || `Request failed (${res.status})`, data);
  }
  return data;
}

export const get = (path) => api(path);
export const post = (path, body) => api(path, { method: 'POST', body });
export const patch = (path, body) => api(path, { method: 'PATCH', body });
export const put = (path, body) => api(path, { method: 'PUT', body });
export const del = (path) => api(path, { method: 'DELETE' });
export const upload = (path, form) => api(path, { method: 'POST', form });
