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

export function googleLogin(idToken) {
  return apiRequest("/api/auth/google", {
    method: "POST",
    body: JSON.stringify({ id_token: idToken }),
  });
}

export function forgotPassword({ email }) {
  return apiRequest("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function verifyOtp({ email, code }) {
  return apiRequest("/api/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

export function resetPassword({ email, code, new_password }) {
  return apiRequest("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ email, code, new_password }),
  });
}

export function getMe() {
  return apiRequest("/api/auth/me");
}