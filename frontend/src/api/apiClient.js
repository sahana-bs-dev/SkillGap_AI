const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

let onUnauthorized = () => {};
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem("token");

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    onUnauthorized();
    throw new Error(data.detail || "Session expired. Please log in again.");
  }

  if (!res.ok) {
    throw new Error(data.detail || "Something went wrong. Please try again.");
  }

  return data;
}