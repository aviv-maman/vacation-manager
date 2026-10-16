import { afterEach, describe, it, expect } from "vitest";

import { mount } from "@vue/test-utils";
import App from "../App.vue";
import { clearSession, saveSession } from "@/lib/session";

afterEach(clearSession);

describe("App", () => {
  it("offers a skip link without showing authenticated navigation to visitors", () => {
    clearSession();

    const wrapper = mount(App, { global: { stubs: { RouterView: true, AppNav: true } } });

    expect(wrapper.get('a[href="#main-content"]').text()).toBe("Skip to content");
    expect(wrapper.find("app-nav-stub").exists()).toBe(false);
  });

  it("shows navigation after login", () => {
    saveSession({
      token: "demo",
      user: { id: 1, name: "Alice", email: "alice@example.com", role: "Requester" },
    });

    const wrapper = mount(App, { global: { stubs: { RouterView: true, AppNav: true } } });

    expect(wrapper.find("app-nav-stub").exists()).toBe(true);
  });
});
