<script setup lang="ts">
import { shallowRef } from "vue";
import VacationForm from "./VacationForm.vue";
import RequestList from "./RequestList.vue";
import { useRequestPage } from "@/composables/useRequestPage";

const { page, data, loading, error, reload } = useRequestPage("/vacation-requests/mine");
const notice = shallowRef("");

function created() {
  notice.value = "Your request was submitted and is awaiting a decision.";
  if (page.value !== 1) page.value = 1;
  else void reload();
}
</script>

<template>
  <div class="space-y-8">
    <header>
      <p class="mb-2 text-xs font-semibold tracking-widest text-emerald-800 uppercase">
        Your time off
      </p>
      <h1 class="page-title">My requests</h1>
      <p class="mt-2 text-slate-500">Plan a break and follow your requests from here.</p>
    </header>
    <VacationForm @created="created" />
    <p
      v-if="notice"
      role="status"
      class="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
    >
      {{ notice }}
    </p>
    <section aria-labelledby="my-list-title">
      <h2 id="my-list-title" class="mb-4 text-lg font-semibold">Request history</h2>
      <RequestList
        :data="data"
        :loading="loading"
        :error="error"
        @reload="reload"
        @page="page = $event"
      />
    </section>
  </div>
</template>
