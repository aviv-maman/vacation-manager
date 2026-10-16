import { afterEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, shallowRef } from "vue";
import { flushPromises } from "@vue/test-utils";
import { api } from "@/lib/api";
import { useRequestPage } from "@/composables/useRequestPage";
import type { RequestFilters } from "@/types/api";

afterEach(() => vi.restoreAllMocks());

describe("shared request pagination", () => {
  it("resets filters to page one and aborts superseded requests", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockResolvedValue({ data: { items: [], page: 1, pageSize: 10, total: 25 } });
    const filters = shallowRef<RequestFilters>({});
    const scope = effectScope();
    const list = scope.run(() => useRequestPage("/vacation-requests", { filters }))!;

    await flushPromises();

    const firstSignal = get.mock.calls[0]![1]!.signal;

    list.page.value = 2;
    await nextTick();
    await flushPromises();
    expect(get.mock.lastCall?.[1]?.params).toEqual({ page: 2 });
    expect(firstSignal?.aborted).toBe(true);
    filters.value = { status: "Pending", userId: 1 };
    await nextTick();
    await flushPromises();
    expect(list.page.value).toBe(1);
    expect(get.mock.lastCall?.[1]?.params).toEqual({ status: "Pending", userId: 1, page: 1 });
    scope.stop();
    expect(get.mock.lastCall?.[1]?.signal?.aborted).toBe(true);
  });
  it("returns to the last page when a decision removes the final filtered row", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockResolvedValue({ data: { items: [], page: 1, pageSize: 10, total: 11 } });
    const scope = effectScope();
    const list = scope.run(() => useRequestPage("/vacation-requests/mine"))!;

    await flushPromises();
    list.page.value = 2;
    await nextTick();
    await flushPromises();
    get.mockResolvedValue({ data: { items: [], page: 1, pageSize: 10, total: 10 } });
    await list.reload();
    await flushPromises();
    expect(list.page.value).toBe(1);
    expect(get.mock.lastCall?.[1]?.params).toEqual({ page: 1 });
    expect(list.error.value).toBe("");
    scope.stop();
  });
});
