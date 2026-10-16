<script setup lang="ts">
import { onMounted, onScopeDispose, shallowRef } from "vue";
import { isAxiosError } from "axios";
import ErrorMessage from "@/components/shared/ErrorMessage.vue";
import RequestFilters from "./RequestFilters.vue";
import RequestList from "./RequestList.vue";
import { useRequestPage } from "@/composables/useRequestPage";
import { useDashboardQuery } from "@/composables/useDashboardQuery";
import { api, errorMessage } from "@/lib/api";
import type { Employee, Items } from "@/types/api";

const { status, employee, page, filters, changePage, resetFilters } = useDashboardQuery();
const { data, loading, error, reload } = useRequestPage("/vacation-requests", { filters, page });
const users = shallowRef<Employee[]>([]);
const usersLoading = shallowRef(true);
const usersError = shallowRef("");
const busyId = shallowRef<number | null>(null);
const actionError = shallowRef("");
const notice = shallowRef("");
const controller = new AbortController();

async function loadUsers() {
  usersLoading.value = true;
  usersError.value = "";
  try {
    users.value = (
      await api.get<Items<Employee>>("/users", {
        params: { role: "Requester" },
        signal: controller.signal,
      })
    ).data.items;
  } catch (failure: unknown) {
    if (!controller.signal.aborted) usersError.value = errorMessage(failure);
  } finally {
    usersLoading.value = false;
  }
}

async function decide(id: number, action: "approve" | "reject", comments?: string) {
  if (busyId.value !== null) return;
  busyId.value = id;
  actionError.value = "";
  notice.value = "";
  try {
    await api.post(
      `/vacation-requests/${id}/${action}`,
      action === "reject" ? { comments } : undefined,
    );
    notice.value = action === "approve" ? "Request approved." : "Request rejected.";
    await reload();
  } catch (failure: unknown) {
    actionError.value = errorMessage(failure);
    if (isAxiosError(failure) && failure.response?.status === 409) await reload();
  } finally {
    busyId.value = null;
  }
}

function reject(id: number, comments: string) {
  void decide(id, "reject", comments);
}

onMounted(loadUsers);
onScopeDispose(() => controller.abort());
</script>

<template>
  <div class="space-y-6">
    <header>
      <p class="mb-2 text-xs font-semibold tracking-widest text-emerald-800 uppercase">
        Team requests
      </p>
      <h1 class="page-title">Review requests</h1>
      <p class="mt-2 text-slate-500">Keep time-off decisions clear and the team covered.</p>
    </header>
    <section class="panel space-y-4 p-5 sm:p-6" aria-labelledby="filter-title">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 id="filter-title" class="text-lg font-semibold">Find requests</h2>
        <button
          type="button"
          class="button button-secondary"
          :disabled="busyId !== null"
          @click="resetFilters"
        >
          Reset filters
        </button>
      </div>
      <p v-if="usersLoading" role="status" class="text-sm text-slate-500">Loading employees…</p>
      <div v-else-if="usersError" class="space-y-2">
        <ErrorMessage :message="usersError" /><button
          type="button"
          class="button button-secondary"
          @click="loadUsers"
        >
          Retry employees
        </button>
      </div>
      <p v-else-if="!users.length" class="text-sm text-slate-500">There are no Requesters yet.</p>
      <RequestFilters
        v-model:status="status"
        v-model:employee="employee"
        :users="users"
        :disabled="usersLoading || busyId !== null"
      />
    </section>
    <ErrorMessage v-if="actionError" :message="actionError" />
    <p
      v-if="notice"
      role="status"
      class="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
    >
      {{ notice }}
    </p>
    <RequestList
      :data="data"
      :loading="loading"
      :error="error"
      reviewable
      :busy-id="busyId"
      @reload="reload"
      @page="changePage"
      @approve="decide($event, 'approve')"
      @reject="reject"
    />
  </div>
</template>
