import axios from "axios";
import { clearSession, sessionToken } from "./session";

export const api = axios.create({ baseURL: "/", timeout: 10_000 });
let unauthorizedHandler: () => void = () => {};

export function setUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler;
}

api.interceptors.request.use((config) => {
  if (sessionToken.value && config.url !== "/auth/login") {
    config.headers.set("Authorization", `Bearer ${sessionToken.value}`);
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      error.config?.url !== "/auth/login"
    ) {
      const sentToken = error.config?.headers.get("Authorization");

      // An old request must not clear a newer login's session.
      if (!sessionToken.value || sentToken === `Bearer ${sessionToken.value}`) {
        clearSession();
        unauthorizedHandler();
      }
    }

    return Promise.reject(error);
  },
);

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError<{ error?: unknown }>(error)) {
    const message = error.response?.data?.error;

    if (typeof message === "string") return message;
    if (!error.response) return "Could not reach the server. Check the connection and try again.";
  }

  return "Something went wrong. Please try again.";
}
