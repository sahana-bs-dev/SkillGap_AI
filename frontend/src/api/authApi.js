import { apiRequest } from "./apiClient";

export function signup({ name, email, password }) {
  return apiRequest("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
}

export function login({ email, password }) {
  return apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function resetPassword({ email, new_password }) {
  return apiRequest("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ email, new_password }),
  });
}

export function getMe() {
  return apiRequest("/api/auth/me");
}