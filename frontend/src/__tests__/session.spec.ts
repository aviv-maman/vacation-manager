import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { api, errorMessage, setUnauthorizedHandler } from "@/lib/api";
import { restoreSession, saveSession, sessionToken, sessionUser } from "@/lib/session";
import { useSession } from "@/composables/useSession";
import { authGuard } from "@/router/guards";
import { createMemoryHistory, createRouter } from "vue-router";
import type { LoginResponse, Role } from "@/types/api";

const alice: LoginResponse = {
  token: "alice-token",
  user: { id: 1, name: "Alice", email: "alice@example.com", role: "Requester" },
};
const originalAdapter = api.defaults.adapter;

function fail(status: number, config: InternalAxiosRequestConfig, message = "Request failed") {
  return new AxiosError(message, "ERR_BAD_RESPONSE", config, undefined, {
    status,
    statusText: String(status),
    data: { error: message },
    headers: new AxiosHeaders(),
    config,
  });
}

beforeEach(() => {
  useSession().logout();
  sessionStorage.clear();
  setUnauthorizedHandler(() => {});
});
afterEach(() => {
  api.defaults.adapter = originalAdapter;
  vi.restoreAllMocks();
  useSession().logout();
});

describe("session and API boundary", () => {
  it("restores a saved profile and discards malformed storage", () => {
    sessionStorage.setItem("vacation-manager.session", JSON.stringify(alice));
    restoreSession();
    expect(sessionUser.value).toEqual(alice.user);
    expect(sessionToken.value).toBe(alice.token);
    sessionStorage.setItem("vacation-manager.session", '{"token":"x","user":{"role":"Admin"}}');
    restoreSession();
    expect(sessionUser.value).toBeNull();
    expect(sessionStorage.getItem("vacation-manager.session")).toBeNull();
  });
  it("attaches the restored bearer token to protected calls", async () => {
    saveSession(alice);

    const adapter: AxiosAdapter = async (config) => {
      expect(config.headers.get("Authorization")).toBe("Bearer alice-token");

      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    };

    await api.get("/vacation-requests/mine", { adapter });
  });
  it("clears storage and requests navigation on a protected 401", async () => {
    saveSession(alice);

    const navigate = vi.fn<() => void>();

    setUnauthorizedHandler(navigate);

    const adapter: AxiosAdapter = async (config) => {
      throw fail(401, config);
    };

    await expect(api.get("/auth/me", { adapter })).rejects.toBeInstanceOf(AxiosError);
    expect(sessionToken.value).toBeNull();
    expect(sessionStorage.getItem("vacation-manager.session")).toBeNull();
    expect(navigate).toHaveBeenCalledOnce();
  });
  it("keeps a wrong-password 401 in the login form", async () => {
    const navigate = vi.fn<() => void>();

    setUnauthorizedHandler(navigate);

    const adapter: AxiosAdapter = async (config) => {
      throw fail(401, config, "Invalid email or password");
    };

    await expect(api.post("/auth/login", {}, { adapter })).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(navigate).not.toHaveBeenCalled();
  });
  it("does not log out for a forbidden response", async () => {
    saveSession(alice);

    const adapter: AxiosAdapter = async (config) => {
      throw fail(403, config);
    };

    await expect(api.get("/users", { adapter })).rejects.toBeInstanceOf(AxiosError);
    expect(sessionUser.value).toEqual(alice.user);
  });
  it("an old in-flight 401 cannot erase a newer login", async () => {
    saveSession(alice);

    const navigate = vi.fn<() => void>();

    setUnauthorizedHandler(navigate);

    const adapter: AxiosAdapter = async (config) => {
      saveSession({ ...alice, token: "new-token" });
      throw fail(401, config);
    };

    await expect(api.get("/auth/me", { adapter })).rejects.toBeInstanceOf(AxiosError);
    expect(sessionToken.value).toBe("new-token");
    expect(navigate).not.toHaveBeenCalled();
  });
  it("uses the canonical user when validating a restored session", async () => {
    saveSession(alice);

    const canonical = { ...alice.user, role: "Validator" as const };
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: { user: canonical } });

    await useSession().ensureUser();
    await useSession().ensureUser();
    expect(get).toHaveBeenCalledOnce();
    expect(sessionUser.value).toEqual(canonical);
  });
  it("shows server errors and gives a useful connection failure", () => {
    const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;

    expect(errorMessage(fail(409, config, "These dates overlap an existing request"))).toContain(
      "overlap",
    );
    expect(errorMessage(new AxiosError("Network error"))).toContain("Could not reach the server");
  });
});

describe("route guards", () => {
  function router() {
    const component = { template: "<div />" };
    const value = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/login", component, meta: { guestOnly: true } },
        { path: "/requests", component, meta: { roles: ["Requester"] } },
        { path: "/dashboard", component, meta: { roles: ["Validator"] } },
        { path: "/team", component, meta: { roles: ["Requester", "Validator"] } },
      ],
    });

    value.beforeEach(authGuard);

    return value;
  }

  it("redirects an anonymous protected URL to login", async () => {
    const value = router();

    await value.push("/team");
    expect(value.currentRoute.value.path).toBe("/login");
  });
  it.each<[Role, string, string]>([
    ["Requester", "/dashboard", "/requests"],
    ["Validator", "/requests", "/dashboard"],
    ["Requester", "/login", "/requests"],
    ["Validator", "/login", "/dashboard"],
  ])("redirects %s from %s to %s", async (role, path, expected) => {
    vi.spyOn(api, "post").mockResolvedValue({ data: { ...alice, user: { ...alice.user, role } } });
    await useSession().login(alice.user.email, "demo");

    const value = router();

    await value.push(path);
    expect(value.currentRoute.value.path).toBe(expected);
    await value.push("/team");
    expect(value.currentRoute.value.path).toBe("/team");
  });
});
