<script setup lang="ts">
import { computed, onScopeDispose, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import ErrorMessage from "@/components/shared/ErrorMessage.vue";
import TeamRangeForm from "./TeamRangeForm.vue";
import TeamTable from "./TeamTable.vue";
import { api, errorMessage } from "@/lib/api";
import { addDays, todayInJerusalem } from "@/lib/dates";
import { calendarDateQuery } from "@/lib/query";
import type { Items, TeamVacation } from "@/types/api";

const today = todayInJerusalem();
const defaults = { from: today, to: addDays(today, 30) };
const route = useRoute();
const router = useRouter();
const range = computed(() => {
  const from = calendarDateQuery(route.query.from) ?? defaults.from;

  return { from, to: calendarDateQuery(route.query.to) ?? addDays(from, 30) };
});
const items = shallowRef<TeamVacation[]>([]);
const loading = shallowRef(true);
const error = shallowRef("");
let controller: AbortController | undefined;

async function loadRange(): Promise<void> {
  controller?.abort();

  const active = new AbortController();

  controller = active;
  // Each request owns its controller so a later response cannot replace newer results.
  loading.value = true;
  error.value = "";
  try {
    const response = await api.get<Items<TeamVacation>>("/team-vacations", {
      params: range.value,
      signal: active.signal,
    });

    if (!active.signal.aborted) items.value = response.data.items;
  } catch (failure: unknown) {
    if (!active.signal.aborted) error.value = errorMessage(failure);
  } finally {
    if (!active.signal.aborted) loading.value = false;
  }
}

function applyRange(value: { from: string; to: string }) {
  if (route.query.from === value.from && route.query.to === value.to) {
    void loadRange();

    return;
  }
  void router.push({ query: { ...route.query, ...value } });
}

function resetRange() {
  void router.push({ query: { ...route.query, from: undefined, to: undefined } });
}

watch(
  range,
  () => {
    void loadRange();
  },
  { immediate: true },
);
onScopeDispose(() => controller?.abort());
</script>

<template>
  <div class="space-y-6">
    <header>
      <p class="mb-2 text-xs font-semibold tracking-widest text-emerald-800 uppercase">
        Plan together
      </p>
      <h1 class="page-title">Team planning</h1>
      <p class="mt-2 text-slate-500">
        See who’s away and plan coverage. Only approved vacations are shown.
      </p>
    </header>
    <TeamRangeForm
      :from="range.from"
      :to="range.to"
      :defaults="defaults"
      :busy="loading"
      @apply="applyRange"
      @reset="resetRange"
    />
    <section :aria-busy="loading" aria-label="Team vacation results">
      <p v-if="loading" role="status" class="panel p-8 text-center text-sm text-slate-500">
        Loading team vacations…
      </p>
      <div v-else-if="error" class="space-y-3">
        <ErrorMessage :message="error" /><button
          type="button"
          class="button button-secondary"
          @click="loadRange()"
        >
          Try again
        </button>
      </div>
      <div v-else-if="!items.length" class="panel p-12 text-center">
        <h2 class="font-semibold">No approved vacations in this range</h2>
        <p class="mt-2 text-sm text-slate-500">Try another date range to see who will be away.</p>
      </div>
      <template v-else
        ><p class="mb-3 text-sm text-slate-500" role="status">
          {{ items.length }} approved {{ items.length === 1 ? "vacation" : "vacations" }}
        </p>
        <TeamTable :items="items"
      /></template>
    </section>
  </div>
</template>
