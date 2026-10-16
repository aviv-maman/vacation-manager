import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import type { VueWrapper } from "@vue/test-utils";
import { createMemoryHistory, createRouter, RouterView } from "vue-router";
import ValidatorWorkspace from "@/components/requests/ValidatorWorkspace.vue";
import TeamPlanning from "@/components/team/TeamPlanning.vue";
import { api } from "@/lib/api";
import { addDays, todayInJerusalem } from "@/lib/dates";

const wrappers: VueWrapper[] = [];

beforeEach(() => {
  vi.spyOn(api, "get").mockImplementation(async (url, config) => {
    if (url === "/users") return { data: { items: [{ id: 1, name: "Alice" }] } };
    if (url === "/team-vacations") return { data: { items: [] } };

    const params = config?.params;
    const page = params && typeof params === "object" && "page" in params ? params.page : 1;

    return { data: { items: [], page, pageSize: 10, total: 21 } };
  });
});
afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount();
  wrappers.length = 0;
  vi.restoreAllMocks();
});

async function renderAt(url: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/dashboard", component: ValidatorWorkspace },
      { path: "/team", component: TeamPlanning },
    ],
  });

  await router.push(url);

  const wrapper = mount(RouterView, { global: { plugins: [router] } });

  wrappers.push(wrapper);
  await flushPromises();

  return { router, wrapper };
}

function latestRequest(path: string) {
  return vi
    .mocked(api.get)
    .mock.calls.filter(([url]) => url === path)
    .slice(-1)[0]?.[1]?.params;
}

describe("URL filters", () => {
  it("restores dashboard filters and page together from a direct link", async () => {
    const { wrapper } = await renderAt("/dashboard?status=Pending&userId=1&page=2");

    expect((wrapper.get("#status-filter").element as HTMLSelectElement).value).toBe("Pending");
    expect((wrapper.get("#employee-filter").element as HTMLSelectElement).value).toBe("1");
    expect(wrapper.text()).toContain("Page 2 of 3");
    expect(latestRequest("/vacation-requests")).toEqual({ status: "Pending", userId: 1, page: 2 });
  });

  it("resets page on filter changes and restores filters/pages with Back and Forward", async () => {
    const { router, wrapper } = await renderAt("/dashboard?status=Pending&userId=1&page=2");

    await wrapper.get("#status-filter").setValue("Approved");
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ status: "Approved", userId: "1" });
    expect(latestRequest("/vacation-requests")).toEqual({ status: "Approved", userId: 1, page: 1 });
    await wrapper.get('[aria-label="Next page"]').trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query.page).toBe("2");
    router.back();
    await flushPromises();
    expect(router.currentRoute.value.query.page).toBeUndefined();
    router.forward();
    await flushPromises();
    expect(wrapper.text()).toContain("Page 2 of 3");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Reset filters")!
      .trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({});
    expect(latestRequest("/vacation-requests")).toEqual({
      status: undefined,
      userId: undefined,
      page: 1,
    });
    router.back();
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ status: "Approved", userId: "1", page: "2" });
    expect((wrapper.get("#status-filter").element as HTMLSelectElement).value).toBe("Approved");
  });

  it("replaces an out-of-range page so Back does not get trapped on it", async () => {
    const { router, wrapper } = await renderAt("/dashboard");

    await router.push("/dashboard?page=99");
    await flushPromises();
    expect(router.currentRoute.value.query.page).toBe("3");
    expect(wrapper.text()).toContain("Page 3 of 3");
    router.back();
    await flushPromises();
    expect(router.currentRoute.value.query.page).toBeUndefined();
    expect(wrapper.text()).toContain("Page 1 of 3");
  });

  it("keeps team dates, Back/Forward, and reset synchronized, including unapplied edits", async () => {
    const { router, wrapper } = await renderAt("/team?from=2060-04-01&to=2060-04-30");

    expect(latestRequest("/team-vacations")).toEqual({ from: "2060-04-01", to: "2060-04-30" });
    await wrapper.get("#team-from").setValue("2060-05-01");
    await wrapper.get("#team-to").setValue("2060-05-15");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ from: "2060-05-01", to: "2060-05-15" });
    router.back();
    await flushPromises();
    expect((wrapper.get("#team-from").element as HTMLInputElement).value).toBe("2060-04-01");
    router.forward();
    await flushPromises();
    expect((wrapper.get("#team-to").element as HTMLInputElement).value).toBe("2060-05-15");

    const reset = () =>
      wrapper
        .findAll("button")
        .find((button) => button.text() === "Reset filters")!
        .trigger("click");

    await reset();
    await flushPromises();

    const today = todayInJerusalem();

    expect(router.currentRoute.value.query).toEqual({});
    expect(latestRequest("/team-vacations")).toEqual({ from: today, to: addDays(today, 30) });
    await wrapper.get("#team-from").setValue("2061-01-01");
    await reset();
    await flushPromises();
    expect((wrapper.get("#team-from").element as HTMLInputElement).value).toBe(today);
    expect((wrapper.get("#team-to").element as HTMLInputElement).value).toBe(addDays(today, 30));
  });

  it("uses safe defaults for malformed or repeated URL values", async () => {
    await renderAt("/dashboard?status=Unknown&userId=-1&page=2&page=3");
    expect(latestRequest("/vacation-requests")).toEqual({
      status: undefined,
      userId: undefined,
      page: 1,
    });
    await renderAt("/team?from=2060-02-30&to=invalid");

    const today = todayInJerusalem();

    expect(latestRequest("/team-vacations")).toEqual({ from: today, to: addDays(today, 30) });
  });
});
