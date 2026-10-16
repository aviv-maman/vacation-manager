<script setup lang="ts">
import { shallowRef } from "vue";
import ErrorMessage from "@/components/shared/ErrorMessage.vue";
import { api, errorMessage } from "@/lib/api";
import { addDays, todayInJerusalem } from "@/lib/dates";
import type { CreateRequestInput } from "@/types/api";

const emit = defineEmits<{ created: [] }>();
const startDate = shallowRef("");
const endDate = shallowRef("");
const reason = shallowRef("");
const busy = shallowRef(false);
const error = shallowRef("");
const today = todayInJerusalem();

async function submit() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";

  const input: CreateRequestInput = { startDate: startDate.value, endDate: endDate.value };

  if (reason.value.trim()) input.reason = reason.value.trim();
  try {
    await api.post("/vacation-requests", input);
    startDate.value = "";
    endDate.value = "";
    reason.value = "";
    emit("created");
  } catch (failure: unknown) {
    error.value = errorMessage(failure);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="panel p-5 sm:p-6" aria-labelledby="new-request-title">
    <h2 id="new-request-title" class="text-lg font-semibold">Plan your time off</h2>
    <p class="mt-1 text-sm text-slate-500">
      Choose your dates. Your end date is included in your vacation.
    </p>
    <form class="mt-5 space-y-4" autocomplete="off" @submit.prevent="submit">
      <ErrorMessage v-if="error" :message="error" />
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="label" for="start-date">Start date</label
          ><input
            id="start-date"
            name="startDate"
            v-model="startDate"
            class="field"
            type="date"
            required
            :min="today"
            :disabled="busy"
          />
        </div>
        <div>
          <label class="label" for="end-date">End date</label
          ><input
            id="end-date"
            name="endDate"
            v-model="endDate"
            class="field"
            type="date"
            required
            :min="startDate ? addDays(startDate, 1) : today"
            :disabled="busy"
          />
        </div>
      </div>
      <div>
        <label class="label" for="request-reason"
          >Reason <span class="font-normal text-slate-500">(optional)</span></label
        ><textarea
          id="request-reason"
          name="reason"
          v-model="reason"
          class="field min-h-24 resize-y"
          rows="2"
          maxlength="500"
          :disabled="busy"
          aria-describedby="reason-help"
        />
        <p id="reason-help" class="mt-1 text-xs text-slate-500">
          Up to 500 characters. Shared with Validators.
        </p>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-xs text-slate-500">Date rules use today in Jerusalem.</p>
        <button class="button button-primary" type="submit" :disabled="busy">
          {{ busy ? "Submitting…" : "Submit request" }}
        </button>
      </div>
    </form>
  </section>
</template>
