import { readonly } from "vue";
import { api } from "@/lib/api";
import { clearSession, saveSession, sessionToken, sessionUser } from "@/lib/session";
import type { LoginResponse, SafeUser } from "@/types/api";

let verifiedToken: string | null = null;
let verification: Promise<void> | null = null;

export function useSession() {
  async function login(email: string, password: string): Promise<void> {
    const { data } = await api.post<LoginResponse>("/auth/login", { email, password });

    saveSession(data);
    verifiedToken = data.token;
  }

  function logout(): void {
    clearSession();
    verifiedToken = null;
  }

  async function ensureUser(): Promise<void> {
    const token = sessionToken.value;

    if (!token || verifiedToken === token) return;
    if (!verification) {
      verification = api
        .get<{ user: SafeUser }>("/auth/me")
        .then(({ data }) => {
          if (sessionToken.value === token) {
            saveSession({ token, user: data.user });
            verifiedToken = token;
          }
        })
        .finally(() => {
          verification = null;
        });
    }
    await verification;
  }

  return { user: readonly(sessionUser), token: readonly(sessionToken), login, logout, ensureUser };
}
