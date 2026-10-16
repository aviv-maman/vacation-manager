import { onScopeDispose, shallowRef, watch } from "vue";
import type { Ref } from "vue";
import { api, errorMessage } from "@/lib/api";
import type { Page, RequestFilters, VacationRequest } from "@/types/api";

export function useRequestPage(
  endpoint: string,
  options: { filters?: Readonly<Ref<RequestFilters>>; page?: Ref<number> } = {},
) {
  const filters = options.filters ?? shallowRef<RequestFilters>({});
  const page = options.page ?? shallowRef(1);
  const data = shallowRef<Page<VacationRequest> | null>(null);
  const loading = shallowRef(true);
  const error = shallowRef("");
  let controller: AbortController | undefined;
  let sequence = 0;

  async function reload(): Promise<void> {
    controller?.abort();
    controller = new AbortController();

    const current = ++sequence;

    loading.value = true;
    error.value = "";
    try {
      const response = await api.get<Page<VacationRequest>>(endpoint, {
        params: { ...filters.value, page: page.value },
        signal: controller.signal,
      });

      if (current !== sequence) return;

      const last = Math.max(1, Math.ceil(response.data.total / response.data.pageSize));

      if (page.value > last) {
        page.value = last;

        return;
      }
      data.value = response.data;
    } catch (failure: unknown) {
      if (current === sequence && !controller.signal.aborted) error.value = errorMessage(failure);
    } finally {
      if (current === sequence) loading.value = false;
    }
  }

  // URL-driven filters reset the page in the same navigation, including on Back/Forward.
  if (!options.page) {
    watch(
      filters,
      () => {
        page.value = 1;
      },
      { flush: "sync" },
    );
  }
  watch(
    [page, filters],
    () => {
      void reload();
    },
    { immediate: true },
  );
  onScopeDispose(() => {
    sequence++;
    controller?.abort();
  });

  return { page, data, loading, error, reload };
}
