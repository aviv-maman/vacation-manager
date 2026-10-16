import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { positiveIntegerQuery } from "@/lib/query";
import type { RequestFilters, VacationStatus } from "@/types/api";

export function useDashboardQuery() {
  const route = useRoute();
  const router = useRouter();
  const status = computed<"" | VacationStatus>({
    get() {
      const value = route.query.status;

      return value === "Pending" || value === "Approved" || value === "Rejected" ? value : "";
    },
    set(value) {
      void router.push({ query: { ...route.query, status: value || undefined, page: undefined } });
    },
  });
  const employee = computed({
    get: () => String(positiveIntegerQuery(route.query.userId) ?? ""),
    set(value: string) {
      void router.push({ query: { ...route.query, userId: value || undefined, page: undefined } });
    },
  });
  const page = computed({
    get: () => positiveIntegerQuery(route.query.page) ?? 1,
    set(value: number) {
      // Automatic correction after the last row disappears must not add a history entry.
      void router.replace({
        query: { ...route.query, page: value > 1 ? String(value) : undefined },
      });
    },
  });
  const filters = computed<RequestFilters>(() => ({
    status: status.value || undefined,
    userId: employee.value ? Number(employee.value) : undefined,
  }));

  function changePage(value: number) {
    void router.push({ query: { ...route.query, page: value > 1 ? String(value) : undefined } });
  }

  function resetFilters() {
    void router.push({
      query: { ...route.query, status: undefined, userId: undefined, page: undefined },
    });
  }

  return { status, employee, page, filters, changePage, resetFilters };
}
