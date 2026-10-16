import { shallowRef } from "vue";
import type { LoginResponse, SafeUser } from "@/types/api";

const storageKey = "vacation-manager.session";
export const sessionUser = shallowRef<SafeUser | null>(null);
export const sessionToken = shallowRef<string | null>(null);

export function clearSession(): void {
  sessionUser.value = null;
  sessionToken.value = null;
  sessionStorage.removeItem(storageKey);
}

export function saveSession(session: LoginResponse): void {
  sessionStorage.setItem(storageKey, JSON.stringify(session));
  sessionUser.value = session.user;
  sessionToken.value = session.token;
}

export function restoreSession(): void {
  try {
    const raw = sessionStorage.getItem(storageKey);

    if (!raw) return;

    const value: unknown = JSON.parse(raw);

    if (!value || typeof value !== "object") throw new Error("Invalid session");

    const { token, user } = value as Record<string, unknown>;

    if (typeof token !== "string" || !token || !user || typeof user !== "object") {
      throw new Error("Invalid session");
    }

    const profile = user as Record<string, unknown>;

    if (
      typeof profile.id !== "number" ||
      !Number.isInteger(profile.id) ||
      profile.id <= 0 ||
      typeof profile.name !== "string" ||
      typeof profile.email !== "string" ||
      (profile.role !== "Requester" && profile.role !== "Validator")
    )
      throw new Error("Invalid user");
    sessionToken.value = token;
    sessionUser.value = {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
    };
  } catch {
    clearSession();
  }
}

restoreSession();
