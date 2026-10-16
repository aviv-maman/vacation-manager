import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { AxiosError, AxiosHeaders } from "axios";
import { api } from "@/lib/api";
import PaginationControls from "@/components/shared/PaginationControls.vue";
import VacationForm from "@/components/requests/VacationForm.vue";
import DecisionActions from "@/components/requests/DecisionActions.vue";
import TeamRangeForm from "@/components/team/TeamRangeForm.vue";
import TeamTable from "@/components/team/TeamTable.vue";
import RequestTable from "@/components/requests/RequestTable.vue";
import { addDays, formatDate, todayInJerusalem } from "@/lib/dates";
import type { VacationRequest } from "@/types/api";

afterEach(() => vi.restoreAllMocks());

describe("request interactions", () => {
  it("paginates at the edges and represents empty results as page 1", async () => {
    const wrapper = mount(PaginationControls, { props: { page: 1, pageSize: 10, total: 16 } });

    expect(wrapper.get('[aria-label="Previous page"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[aria-label="Next page"]').trigger("click");
    expect(wrapper.emitted("change")).toEqual([[2]]);
    await wrapper.setProps({ page: 2 });
    expect(wrapper.get('[aria-label="Next page"]').attributes("disabled")).toBeDefined();
    await wrapper.setProps({ page: 1, total: 0 });
    expect(wrapper.text()).toContain("Page 1 of 1");
    expect(wrapper.get('[aria-label="Next page"]').attributes("disabled")).toBeDefined();
  });
  it("omits an empty reason, blocks duplicate submits, then clears the form", async () => {
    let finish!: (value: unknown) => void;
    const post = vi.spyOn(api, "post").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const wrapper = mount(VacationForm);

    await wrapper.get("#start-date").setValue("2060-04-10");
    await wrapper.get("#end-date").setValue("2060-04-12");
    await wrapper.get("#request-reason").setValue("  ");
    await wrapper.get("form").trigger("submit");
    await wrapper.get("form").trigger("submit");
    expect(post).toHaveBeenCalledExactlyOnceWith("/vacation-requests", {
      startDate: "2060-04-10",
      endDate: "2060-04-12",
    });
    expect(wrapper.get('button[type="submit"]').attributes("disabled")).toBeDefined();
    finish({ data: {} });
    await flushPromises();
    expect(wrapper.emitted("created")).toEqual([[]]);
    expect((wrapper.get("#start-date").element as HTMLInputElement).value).toBe("");
    wrapper.unmount();
  });
  it("shows the server's overlap message without losing entered dates", async () => {
    const config = { headers: new AxiosHeaders() };

    vi.spyOn(api, "post").mockRejectedValue(
      new AxiosError("Conflict", "409", config, undefined, {
        config,
        status: 409,
        statusText: "Conflict",
        headers: {},
        data: { error: "These dates overlap an existing request" },
      }),
    );

    const wrapper = mount(VacationForm);

    await wrapper.get("#start-date").setValue("2060-04-10");
    await wrapper.get("#end-date").setValue("2060-04-12");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("overlap");
    expect((wrapper.get("#start-date").element as HTMLInputElement).value).toBe("2060-04-10");
    expect(wrapper.emitted("created")).toBeUndefined();
    wrapper.unmount();
  });
  it("requires a nonblank rejection comment and sends its trimmed value", async () => {
    const wrapper = mount(DecisionActions, {
      props: { requestId: 42, disabled: false, busy: false },
      attachTo: document.body,
    });

    await wrapper.findAll("button")[1]!.trigger("click");
    expect(document.activeElement).toBe(wrapper.get("textarea").element);
    await wrapper.get("textarea").setValue("   ");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("reject")).toBeUndefined();
    await wrapper.get("textarea").setValue("  Please choose another week.  ");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("reject")).toEqual([[42, "Please choose another week."]]);
    wrapper.unmount();
  });
  it("only offers decisions on Pending rows and displays rejection comments", () => {
    const request: VacationRequest = {
      id: 1,
      userId: 1,
      startDate: "2060-04-10",
      endDate: "2060-04-12",
      reason: null,
      status: "Pending",
      comments: null,
      createdAt: "",
      updatedAt: "",
      user: { id: 1, name: "Alice" },
    };
    const wrapper = mount(RequestTable, {
      props: {
        reviewable: true,
        items: [request, { ...request, id: 2, status: "Rejected", comments: "Coverage needed" }],
      },
    });

    expect(wrapper.findAllComponents(DecisionActions)).toHaveLength(1);
    expect(wrapper.text()).toContain("Coverage needed");
    expect(wrapper.text()).toContain("Pending");
  });
});

describe("team planning and date-only rendering", () => {
  it("accepts the 366-day boundary and rejects 367 days", async () => {
    const from = "2060-01-01";
    const wrapper = mount(TeamRangeForm, {
      props: {
        from,
        to: addDays(from, 366),
        defaults: { from, to: addDays(from, 30) },
        busy: false,
      },
    });

    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("apply")).toEqual([[{ from, to: addDays(from, 366) }]]);
    await wrapper.get("#team-to").setValue(addDays(from, 367));
    await wrapper.get("form").trigger("submit");
    expect(wrapper.get('[role="alert"]').text()).toContain("366");
    expect(wrapper.emitted("apply")).toHaveLength(1);
  });
  it("renders identical public rows without duplicate keys", () => {
    const warn = vi.spyOn(console, "warn");
    const item = { name: "Same name", startDate: "2060-04-10", endDate: "2060-04-12" };
    const wrapper = mount(TeamTable, { props: { items: [item, { ...item }] } });

    expect(wrapper.findAll("tbody tr")).toHaveLength(2);
    expect(wrapper.findAll("th").map((cell) => cell.text())).toEqual([
      "Employee",
      "Start date",
      "End date",
    ]);
    expect(warn).not.toHaveBeenCalled();
    expect(formatDate(item.startDate)).toBe("10 Apr 2060");
  });
  it("computes Jerusalem's today and dates across daylight saving", () => {
    expect(todayInJerusalem(new Date("2026-10-16T22:00:00Z"))).toBe("2026-10-17");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
  });
});
